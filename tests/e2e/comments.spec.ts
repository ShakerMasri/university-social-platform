import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { digest } from "../../src/server/identity/policy";
import { commentText } from "../../src/i18n/comments";
import { paginationText } from "../../src/i18n/pagination";
import { postText } from "../../src/i18n/posts";


test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const createdCommunities: string[] = [];
const post = (request: APIRequestContext, path: string, data: object, headers: Record<string, string> = {}) => request.post(path, { data, headers: { Origin: origin, ...headers } });
const input = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), type: "QUESTION", title: "سؤال Question 😀", body: "Useful synthetic content", ...extra });
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable posts browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic posts fixture failed; credentials omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
async function signIn(context: BrowserContext, displayName?: string) {
  const email = `posts.${randomUUID()}@university.test`;
  expect((await post(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await post(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (displayName) expect((await post(context.request, "/api/identity/profile", { displayName })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function space(context: BrowserContext, visibility = "PUBLIC") {
  const result = await post(context.request, "/api/communities", { name: `Posts ${randomUUID()}`, description: "", visibility });
  expect(result.status()).toBe(201);
  const id = (await result.json() as { id: string }).id; createdCommunities.push(id); return id;
}

// This suite creates its own fixtures, and leaves discovery empty for the
// existing empty-state check. Never target development or unrelated test rows.
test.afterAll(async () => {
  await fixture(async client => {
    await client.query("BEGIN");
    try {
      await client.query('DELETE FROM "Comment" WHERE "postId" IN (SELECT id FROM "Post" WHERE "communityId"=ANY($1::uuid[]))', [createdCommunities]);
      await client.query('DELETE FROM "Post" WHERE "communityId"=ANY($1::uuid[])', [createdCommunities]);
      await client.query('DELETE FROM "CommunityMembership" WHERE "communityId"=ANY($1::uuid[])', [createdCommunities]);
      await client.query('DELETE FROM "Community" WHERE id=ANY($1::uuid[])', [createdCommunities]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  });
});


const comment = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), body: "تعليق Comment 😀", ...extra });
async function parent(context: BrowserContext, id: string, type = "QUESTION") { const response = await post(context.request, `/api/communities/${id}/posts`, input({ type })); expect(response.status()).toBe(201); return (await response.json() as {id: string}).id; }

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: editing after a lost response requires a deliberate new submission`, async ({ context, page }) => {
    await signIn(context, "Retry author"); const id = await space(context), postId = await parent(context, id), text = commentText[locale];
    const path = `/api/communities/${id}/posts/${postId}/comments`;
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const field = page.getByLabel(text.body, { exact: true }), button = page.getByRole("button", { name: text.publish, exact: true });
    await page.route(`**${path}`, async route => { await route.fetch(); await route.abort("failed"); });
    await field.fill("Original committed comment"); await button.click();
    await expect(page.getByRole("status")).toHaveText(text.failed);
    await page.unroute(`**${path}`);
    await field.fill("Changed deliberate comment"); await button.click();
    await expect(page.getByRole("status")).toHaveText(text.conflict);
    await expect(page.getByRole("status")).toBeFocused();
    await expect(field).toHaveValue("Changed deliberate comment");
    expect((await (await context.request.get(path)).json() as { items: { body: string }[] }).items.map(item => item.body)).toEqual(["Original committed comment"]);
    await button.click(); await expect(page.getByRole("status")).toHaveText(text.saved);
    expect((await (await context.request.get(path)).json() as { items: { body: string }[] }).items.map(item => item.body)).toEqual(["Original committed comment", "Changed deliberate comment"]);
  });

  test(`${locale}: validation focus, pending state and a lost response retain a safe retry`, async ({ context, page }) => {
    await signIn(context, "Retry author"); const id = await space(context), postId = await parent(context, id), text = commentText[locale];
    const path = `/api/communities/${id}/posts/${postId}/comments`;
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const field = page.getByLabel(text.body, { exact: true }), button = page.getByRole("button", { name: text.publish, exact: true });
    await field.fill("x".repeat(4001)); await button.click();
    await expect(page.getByRole("status")).toHaveText(text.invalid);
    await expect(page.getByRole("status")).toBeFocused();
    let release: () => void = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      await route.fetch(); // Commit the write, then simulate losing its response.
      await pending; await route.abort("failed");
    });
    await field.fill("تعليق Retry 😀"); await button.click();
    await expect(field).toBeDisabled();
    await expect(page.getByRole("button", { name: text.busy, exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("status")).toHaveText(text.failed);
    await expect(page.getByRole("status")).toBeFocused();
    await expect(field).toHaveValue("تعليق Retry 😀");
    await page.unroute(`**${path}`);
    await button.click(); await expect(page.getByRole("status")).toHaveText(text.saved);
    expect((await (await context.request.get(path)).json() as { items: unknown[] }).items.length).toBe(1);
  });

  test(`${locale}: keyboard comments on every post type, inert text, RTL and mixed attribution`, async ({ context, page }) => {
    await signIn(context, "كاتب Author 😀"); const id = await space(context), text = commentText[locale];
    await page.setViewportSize({ width: 360, height: 800 });
    let executed = false; page.on("dialog", async dialog => { executed = true; await dialog.dismiss(); });
    for (const type of ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"]) {
      const postId = await parent(context, id, type), body = `<script>alert(1)</script> تعليق ${type}`;
      await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
      await page.getByLabel(text.body, { exact: true }).fill(body);
      await page.getByRole("button", { name: text.publish, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.getByText(body, { exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toContainText(text.saved);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.getByLabel(text.body, { exact: true })).toHaveValue("");
      expect(await page.locator("main script, main img, main svg").count()).toBe(0);
      expect(await page.locator("article bdi").last().textContent()).toBe("كاتب Author 😀");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    expect(executed).toBe(false);
  });

  test(`${locale}: comment pagination preserves stable order and rejects another parent cursor`, async ({ context, page }) => {
    const author = await signIn(context, "Pagination"), id = await space(context), postId = await parent(context, id), other = await parent(context, id);
    const ids = Array.from({ length: 23 }, () => randomUUID()).sort();
    await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),id::text FROM unnest($1::uuid[]) id', [ids, postId, author]));
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const section = page.getByRole("region", { name: commentText[locale].title });
    await expect(section.getByRole("article")).toHaveCount(20);
    expect(await section.locator("article .community-description").allTextContents()).toEqual(ids.slice(0, 20));
    const initialUrl = page.url();
    await page.getByRole("button", { name: commentText[locale].more, exact: true }).scrollIntoViewIfNeeded();
    await expect(section.getByRole("article")).toHaveCount(23);
    expect(await section.locator("article .community-description").allTextContents()).toEqual(ids);
    await expect(page.getByRole("button", { name: commentText[locale].more, exact: true })).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);
    expect((await context.request.get(`/api/communities/${id}/posts/${other}/comments?after=${ids[19]}`)).status()).toBe(404);
    await page.goto(`/${locale}/communities/${id}/posts/${postId}?after=${ids[19]}`);
    await expect(section.getByRole("article")).toHaveCount(3);
    await page.getByRole("link", { name: commentText[locale].first, exact: true }).click();
    await expect(section.getByRole("article")).toHaveCount(20);
  });

  test(`${locale}: a new comment is visible before older pages load and appears only once after scrolling`, async ({ context, page }) => {
    const author = await signIn(context, "Immediate author"), id = await space(context), postId = await parent(context, id), text = commentText[locale];
    const ids = Array.from({ length: 43 }, () => randomUUID());
    await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Earlier comment\' FROM unnest($1::uuid[]) id', [ids, postId, author]));
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const section = page.getByRole("region", { name: text.title }), marker = "تعليق جديد Visible immediately 😀";
    await expect(section.getByRole("article")).toHaveCount(20);
    await page.getByLabel(text.body, { exact: true }).fill(marker);
    await page.getByRole("button", { name: text.publish, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(text.saved);
    await expect(page.getByText(marker, { exact: true })).toBeInViewport();
    await expect(section.getByRole("article")).toHaveCount(21);
    await expect(page.getByRole("region", { name: text.justPublished })).toBeVisible();
    for (const count of [41, 44]) {
      await page.getByRole("button", { name: text.more, exact: true }).scrollIntoViewIfNeeded();
      await expect(section.getByRole("article")).toHaveCount(count);
    }
    await expect(page.getByRole("region", { name: text.justPublished })).toHaveCount(0);
    await expect(page.getByText(marker, { exact: true })).toHaveCount(1);
    expect(await section.getByRole("article").last().locator(".community-description").textContent()).toBe(marker);
  });

  test(`${locale}: pagination failures preserve loaded comments and allow a keyboard retry`, async ({ context, page }) => {
    const author = await signIn(context, "Retry reader"), id = await space(context), postId = await parent(context, id), text = commentText[locale], paging = paginationText[locale];
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Earlier comment\' FROM unnest($1::uuid[]) id', [ids, postId, author]));
    let attempts = 0;
    await page.route(`**/posts/${postId}/comments?after=*`, async route => { attempts++; await route.abort("failed"); });
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    await page.getByRole("button", { name: text.more, exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(paging.failed);
    await expect(page.getByRole("region", { name: text.title }).getByRole("article")).toHaveCount(20);
    expect(attempts).toBe(1);
    await page.unroute(`**/posts/${postId}/comments?after=*`);
    await page.getByRole("button", { name: paging.retry, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: text.title }).getByRole("article")).toHaveCount(23);
    await expect(page.locator("article:focus")).toHaveCount(1);
  });
}

test("comments: an in-flight page cannot populate a different post after client navigation", async ({ context, page }) => {
  const author = await signIn(context, "Navigation reader"), id = await space(context), postId = await parent(context, id), other = await parent(context, id);
  const ids = Array.from({ length: 23 }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Old navigation marker\' FROM unnest($1::uuid[]) id', [ids, postId, author]));
  let release: () => void = () => {}, reached: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const path = `/api/communities/${id}/posts/${postId}/comments`;
  await page.route(`**${path}?after=*`, async route => {
    const response = await route.fetch(); reached(); await hold;
    // The old request may already have been aborted when the component unmounts.
    try { await route.fulfill({ response }); } catch { /* Expected for a canceled request. */ }
  });
  try {
    await page.goto(`/en/communities/${id}/posts/${postId}`);
    await page.getByRole("button", { name: commentText.en.more, exact: true }).scrollIntoViewIfNeeded(); await ready;
    await expect(page.getByRole("button", { name: paginationText.en.loading, exact: true })).toBeDisabled();
    await page.getByRole("link", { name: postText.en.back, exact: true }).click();
    await page.locator(`a[href="/en/communities/${id}/posts/${other}"]`).click();
    release();
    await expect(page.getByText(commentText.en.empty, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: commentText.en.title }).getByRole("article")).toHaveCount(0);
    expect((await page.getByRole("main").innerText()).includes("Old navigation marker")).toBe(false);
  } finally { release(); }
});

for (const kind of ["comments", "posts"] as const) {
  test(`${kind}: scrolling rechecks private access and clears loaded content after membership removal`, async ({ context, browser }) => {
    const author = await signIn(context, "Owner"), id = await space(context, "PRIVATE"), postId = await parent(context, id);
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await fixture(client => kind === "comments"
      ? client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Private scroll marker\' FROM unnest($1::uuid[]) id', [ids, postId, author])
      : client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',\'Private scroll marker\',\'Private scroll body\' FROM unnest($1::uuid[]) id', [ids, id, author]));
    const memberContext = await browser.newContext({ baseURL: origin });
    try {
      const member = await signIn(memberContext, "Member");
      expect((await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
      expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId: member })).status()).toBe(200);
      const page = await memberContext.newPage();
      await page.goto(kind === "comments" ? `/en/communities/${id}/posts/${postId}` : `/en/communities/${id}`);
      const region = page.getByRole("region", { name: kind === "comments" ? commentText.en.title : postText.en.title, exact: true });
      await expect(region.getByRole("article")).toHaveCount(20);
      if (kind === "comments") {
        await page.getByLabel(commentText.en.body, { exact: true }).fill("Private just-published marker");
        await page.getByRole("button", { name: commentText.en.publish, exact: true }).click();
        await expect(page.getByText("Private just-published marker", { exact: true })).toBeVisible();
      }
      expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId: member })).status()).toBe(200);
      await page.getByRole("button", { name: kind === "comments" ? commentText.en.more : postText.en.more, exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: kind === "comments" ? commentText.en.publish : postText.en.publish, exact: true })).toHaveCount(0);
      expect((await page.getByRole("main").innerText()).includes("Private scroll marker")).toBe(false);
      expect((await page.getByRole("main").innerText()).includes("Private just-published marker")).toBe(false);
    } finally { await memberContext.close(); }
  });
}

test("comments: private pending/nonmember denial, forged authority/CSRF, parent swaps and removal", async ({ context, browser }) => {
  const owner = await signIn(context, "Owner"), id = await space(context, "PRIVATE"), postId = await parent(context, id), path = `/api/communities/${id}/posts/${postId}/comments`;
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect((await other.request.get(path)).status()).toBe(401);
    expect((await post(other.request, path, comment())).status()).toBe(401);
    const member = await signIn(other, "Member"), decoy = await space(other);
    expect((await other.request.get(path)).status()).toBe(404);
    expect((await post(other.request, path, comment(), { "X-User-Id": owner, "X-Role": "teacher" })).status()).toBe(404);
    await post(other.request, `/api/communities/${id}/memberships`, { action: "join" });
    expect((await other.request.get(path)).status()).toBe(404);
    expect((await post(other.request, path, comment())).status()).toBe(404);
    await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId: member });
    const data = comment({ body: "Private comment marker" });
    expect((await post(other.request, path, data)).status()).toBe(201);
    const read = await other.request.get(path); expect(read.headers()["cache-control"]).toBe("private, no-store");
    const listing = await read.json() as { items: Record<string, unknown>[] };
    expect(Object.keys(listing.items[0]).sort()).toEqual(["authorName", "body", "createdAt", "id"]);
    for (const extra of [{ authorId: owner }, { postId }, { communityId: decoy }, { role: "admin" }, { createdAt: "2020-01-01" }]) expect((await post(other.request, path, comment(extra))).status()).toBe(400);
    for (const Origin of ["", "https://attacker.invalid"]) expect((await post(other.request, path, comment(), { Origin })).status()).toBe(403);
    expect((await other.request.get(`/api/communities/${decoy}/posts/${postId}/comments`)).status()).toBe(404);
    expect((await post(other.request, `/api/communities/${decoy}/posts/${postId}/comments`, comment())).status()).toBe(404);
    await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId: member });
    expect((await other.request.get(`${path}?after=${listing.items[0].id}`)).status()).toBe(404);
    expect((await post(other.request, path, data)).status()).toBe(404);
    const page = await other.newPage();
    for (const locale of ["en", "ar"]) {
      const response = await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      expect((await response!.text()).includes("Private comment marker")).toBe(false);
      await expect(page.locator("#comments-heading")).toHaveCount(0);
    }
  } finally { await other.close(); }
});

test("comments: public reading survives removal, profileless members cannot publish, bounded API and no edits", async ({ context, browser }) => {
  await signIn(context, "Owner"); const id = await space(context), postId = await parent(context, id), path = `/api/communities/${id}/posts/${postId}/comments`;
  const other = await browser.newContext({ baseURL: origin });
  try {
    const member = await signIn(other);
    expect((await other.request.get(path)).status()).toBe(200);
    expect((await post(other.request, path, comment())).status()).toBe(403);
    await post(other.request, `/api/communities/${id}/memberships`, { action: "join" });
    expect((await post(other.request, path, comment())).status()).toBe(403);
    const page = await other.newPage(); await page.goto(`/ar/communities/${id}/posts/${postId}`);
    await expect(page.getByText(commentText.ar.hint, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: commentText.ar.publish })).toHaveCount(0);
    await post(other.request, "/api/identity/profile", { displayName: "Member" });
    const data = comment(); expect((await post(other.request, path, data)).status()).toBe(201);
    await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId: member });
    expect((await other.request.get(path)).status()).toBe(200);
    expect((await post(other.request, path, data)).status()).toBe(403);
    for (const body of [" ", "x".repeat(4001), "x".repeat(33000), "x\u0001y"]) expect((await post(context.request, path, comment({ body }))).status()).toBe(400);
    expect((await post(context.request, path, comment({ body: "😀".repeat(4000) }))).status()).toBe(201);
    for (const suffix of ["?after=bad", "?after=", "?extra=x", `?after=${randomUUID()}&after=${randomUUID()}`]) expect((await context.request.get(path + suffix)).status()).toBe(400);
    for (const method of ["PATCH", "DELETE"]) expect((await context.request.fetch(path, { method, data: comment(), headers: { Origin: origin } })).status()).toBe(405);
  } finally { await other.close(); }
});

test("comments: concurrent retries resolve once, changed payload conflicts and durable budget is separate", async ({ context }) => {
  const author = await signIn(context, "Author"), id = await space(context), postId = await parent(context, id), path = `/api/communities/${id}/posts/${postId}/comments`, data = comment();
  const responses = await Promise.all([post(context.request, path, data), post(context.request, path, data)]);
  for (const response of responses) expect(response.status()).toBe(201);
  const ids = await Promise.all(responses.map(async response => (await response.json() as { id: string }).id)); expect(ids[0] === ids[1]).toBe(true);
  expect((await post(context.request, path, { ...data, body: "Changed" })).status()).toBe(409);
  const key = digest(`m3-comment-write:${author}`);
  await fixture(client => client.query('UPDATE "IdentityRateLimit" SET hits=30,"startedAt"=clock_timestamp() WHERE "keyDigest"=$1', [key]));
  expect((await post(context.request, path, comment())).status()).toBe(429);
  expect((await post(context.request, `/api/communities/${id}/posts`, input())).status()).toBe(201);
  expect((await (await context.request.get(path)).json() as { items: unknown[] }).items.length).toBe(1);
});

test("comments: malformed Unicode is rejected without consuming a submission key or attempt", async ({ context }) => {
  const author = await signIn(context, "Unicode author"), id = await space(context), postId = await parent(context, id), path = `/api/communities/${id}/posts/${postId}/comments`;
  const data = comment();
  for (const body of ["\ud800", "\udfff", "before\ud800after", "\udfff\ud800"]) {
    expect((await post(context.request, path, { ...data, body })).status()).toBe(400);
  }
  expect((await (await context.request.get(path)).json() as { items: unknown[] }).items).toHaveLength(0);
  const key = digest(`m3-comment-write:${author}`);
  expect(await fixture(async client => (await client.query('SELECT hits FROM "IdentityRateLimit" WHERE "keyDigest"=$1', [key])).rowCount)).toBe(0);
  const response = await post(context.request, path, data); expect(response.status()).toBe(201);
  expect((await post(context.request, path, data)).status()).toBe(201);
  const listing = await (await context.request.get(path)).json() as { items: { id: string; body: string }[] };
  expect(listing.items).toHaveLength(1);
  expect(listing.items[0]).toMatchObject({ id: (await response.json() as { id: string }).id, body: data.body });
});
