import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { digest } from "../../src/server/identity/policy";
import { postText } from "../../src/i18n/posts";
import { postTypes } from "../../src/server/posts/policy";
import { paginationText } from "../../src/i18n/pagination";

test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
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
  expect(result.status()).toBe(201); return (await result.json() as { id: string }).id;
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: keyboard creation of all four types, resource links, detail language switching and narrow layout`, async ({ context, page }) => {
    await signIn(context, "كاتب Author 😀"); const id = await space(context), text = postText[locale];
    await page.setViewportSize({ width: 360, height: 800 });
    for (const type of postTypes) {
      await page.goto(`/${locale}/communities/${id}`);
      const title = `${type} عربي 😀`;
      await page.getByLabel(text.type, { exact: true }).selectOption(type);
      await page.getByLabel(text.postTitle, { exact: true }).fill(title);
      await page.getByLabel(text.body, { exact: true }).fill("محتوى English\nSecond line");
      if (type === "RESOURCE") await page.getByLabel(text.link, { exact: true }).fill("https://example.test/lecture");
      await page.getByRole("button", { name: text.publish, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (type === "RESOURCE") {
        const link = page.getByRole("link", { name: "https://example.test/lecture", exact: true });
        await expect(link).toHaveAttribute("rel", "noopener noreferrer"); await expect(link).toHaveAttribute("target", "_blank");
      }
      const other = locale === "en" ? "ar" : "en";
      await page.getByRole("link", { name: other === "ar" ? "العربية" : "English", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", other);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
  });
}

test("posts adversarial: private direct links, parent-ID swaps, creator authority, CSRF and removal", async ({ context, browser }) => {
  const ownerId = await signIn(context, "Owner"), id = await space(context, "PRIVATE"), path = `/api/communities/${id}/posts`;
  const created = await post(context.request, path, input({ title: "Private post marker", body: "Private body marker" }));
  expect(created.status()).toBe(201); const postId = (await created.json() as { id: string }).id;
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect((await other.request.get(path)).status()).toBe(401);
    expect((await other.request.get(`${path}/${postId}`)).status()).toBe(401);
    const memberId = await signIn(other, "Attacker member"), decoy = await space(other, "PRIVATE");
    expect((await other.request.get(`${path}/${postId}`)).status()).toBe(404);
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
    expect((await other.request.get(path)).status()).toBe(404);
    expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId: memberId })).status()).toBe(200);
    const read = await other.request.get(`${path}/${postId}`); expect(read.status()).toBe(200);
    expect(read.headers()["cache-control"]).toBe("private, no-store");
    const data = (await read.json() as { post: Record<string, unknown> }).post;
    expect(Object.keys(data).some(key => ["authorId", "submissionKey", "email"].includes(key))).toBe(false);
    expect((await post(other.request, path, input({ type: "ANNOUNCEMENT" }), { "X-User-Id": ownerId, "X-Role": "teacher" })).status()).toBe(403);
    for (const extra of [{ authorId: ownerId }, { ownerId }, { communityId: decoy }, { role: "admin" }]) expect((await post(other.request, path, input(extra))).status()).toBe(400);
    expect((await other.request.get(`/api/communities/${decoy}/posts/${postId}`)).status()).toBe(404);
    expect((await other.request.get(`/api/communities/${decoy}/posts?after=${postId}`)).status()).toBe(404);
    for (const Origin of ["", "https://attacker.invalid"]) expect((await post(context.request, path, input(), { Origin })).status()).toBe(403);
    expect((await post(other.request, path, input({ type: "RESOURCE", resourceUrl: "javascript:alert(1)" }))).status()).toBe(400);
    expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId: memberId })).status()).toBe(200);
    expect((await other.request.get(`${path}/${postId}`)).status()).toBe(404);
    expect((await post(other.request, path, input())).status()).toBe(404);
    const page = await other.newPage();
    for (const locale of ["en", "ar"] as const) {
      const response = await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(postText[locale].unavailable);
      const html = await response!.text(); expect(html.includes("Private post marker") || html.includes("Private body marker")).toBe(false);
    }
  } finally { await other.close(); }
});

test("posts: public reads do not grant publishing; profileless members and ordinary methods stay restricted", async ({ context, browser }) => {
  await signIn(context, "Owner"); const id = await space(context), path = `/api/communities/${id}/posts`;
  const created = await post(context.request, path, input()); const postId = (await created.json() as { id: string }).id;
  const other = await browser.newContext({ baseURL: origin });
  try {
    await signIn(other);
    expect((await other.request.get(path)).status()).toBe(200);
    expect((await post(other.request, path, input())).status()).toBe(403);
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
    expect((await post(other.request, path, input())).status()).toBe(403);
    const page = await other.newPage(); await page.goto(`/en/communities/${id}`);
    await expect(page.getByText(postText.en.joinHint, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: postText.en.publish, exact: true })).toHaveCount(0);
    for (const method of ["PATCH", "DELETE"]) expect((await context.request.fetch(`${path}/${postId}`, { method, headers: { Origin: origin }, data: { body: "Overwrite" } })).status()).toBe(405);
    expect((await context.request.get(`${path}/${postId}`)).status()).toBe(200);
    expect((await post(context.request, path, input({ body: "x".repeat(70000) }))).status()).toBe(400);
  } finally { await other.close(); }
});

test("posts: concurrent replay creates once, changed retry conflicts and another author cannot reuse authority", async ({ context, browser }) => {
  await signIn(context, "Owner"); const id = await space(context), path = `/api/communities/${id}/posts`, data = input();
  const responses = await Promise.all([post(context.request, path, data), post(context.request, path, data)]);
  for (const response of responses) expect(response.status()).toBe(201);
  const ids = await Promise.all(responses.map(async response => (await response.json() as { id: string }).id));
  expect(ids[0] === ids[1]).toBe(true);
  expect((await post(context.request, path, { ...data, body: "Changed content" })).status()).toBe(409);
  const other = await browser.newContext({ baseURL: origin });
  try {
    await signIn(other, "Other author");
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
    const result = await post(other.request, path, data); expect(result.status()).toBe(201);
    expect((await result.json() as { id: string }).id === ids[0]).toBe(false);
    const listing = await (await context.request.get(path)).json() as { items: unknown[] };
    expect(listing.items.length).toBe(2);
  } finally { await other.close(); }
});

test("posts adversarial: stored markup is inert and resource links are never fetched as previews", async ({ context, browser }) => {
  await signIn(context, "Payload author"); const id = await space(context), path = `/api/communities/${id}/posts`;
  const title = '<img src=x onerror="alert(1)">', body = '<script>alert(1)</script><svg onload="alert(1)"></svg>';
  const created = await post(context.request, path, input({ type: "RESOURCE", title, body, resourceUrl: "https://example.test/no-preview" }));
  expect(created.status()).toBe(201); const postId = (await created.json() as { id: string }).id;
  const reader = await browser.newContext({ baseURL: origin });
  try {
    await signIn(reader, "Payload reader"); const page = await reader.newPage(); let executed = false, external = false;
    page.on("dialog", async dialog => { executed = true; await dialog.dismiss(); });
    page.on("request", request => { if (new URL(request.url()).hostname === "example.test") external = true; });
    await page.goto(`/ar/communities/${id}/posts/${postId}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect((await page.getByRole("main").innerText()).includes(body)).toBe(true);
    expect(await page.locator("main img, main svg, main script").count()).toBe(0); expect(executed || external).toBe(false);
    await expect(page.getByRole("link", { name: "https://example.test/no-preview", exact: true })).toHaveAttribute("rel", "noopener noreferrer");
  } finally { await reader.close(); }
});

test("posts: rejected announcement attempts consume the durable user posting budget", async ({ context, browser }) => {
  await signIn(context, "Owner"); const id = await space(context), path = `/api/communities/${id}/posts`;
  const other = await browser.newContext({ baseURL: origin });
  try {
    const userId = await signIn(other, "Member");
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
    const key = digest(`m3-post-write:${userId}`);
    await fixture(client => client.query('INSERT INTO "IdentityRateLimit" ("keyDigest",hits) VALUES ($1,29) ON CONFLICT ("keyDigest") DO UPDATE SET hits=29,"startedAt"=clock_timestamp()', [key]));
    expect((await post(other.request, path, input({ type: "ANNOUNCEMENT" }))).status()).toBe(403);
    expect((await post(other.request, path, input())).status()).toBe(429);
    const items = await (await context.request.get(path)).json() as { items: unknown[] }; expect(items.items.length).toBe(0);
  } finally { await other.close(); }
});

test("posts: browser pagination follows scoped cursors without losing or duplicating entries", async ({ context, page }) => {
  const ownerId = await signIn(context, "Pagination author"), id = await space(context);
  const ids = Array.from({ length: 23 }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',\'Page entry\',\'Synthetic page text\' FROM unnest($1::uuid[]) id', [ids, id, ownerId]));
  await page.goto(`/en/communities/${id}`);
  await expect(page.getByRole("article")).toHaveCount(20);
  const first = await page.getByRole("article").getByRole("link", { name: postText.en.open, exact: true }).evaluateAll(links => links.map(link => link.getAttribute("href")));
  const initialUrl = page.url();
  await page.getByRole("button", { name: postText.en.more, exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("article")).toHaveCount(23);
  const all = await page.getByRole("article").getByRole("link", { name: postText.en.open, exact: true }).evaluateAll(links => links.map(link => link.getAttribute("href")));
  expect(all.slice(0, 20)).toEqual(first);
  expect(new Set(all).size).toBe(23);
  expect(all.map(href => href!.split("/").at(-1))).toEqual(ids.sort().reverse());
  expect(page.url()).toBe(initialUrl);
  await expect(page.getByRole("button", { name: postText.en.more, exact: true })).toHaveCount(0);
});

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: post pagination supports keyboard fallback and retry without IntersectionObserver`, async ({ context, page }) => {
    const ownerId = await signIn(context, "Pagination author"), id = await space(context), text = postText[locale], paging = paginationText[locale];
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await fixture(client => client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',\'Page entry\',\'Synthetic page text\' FROM unnest($1::uuid[]) id', [ids, id, ownerId]));
    await page.addInitScript(() => { Reflect.deleteProperty(window, "IntersectionObserver"); });
    let attempts = 0;
    await page.route(`**/communities/${id}/posts?after=*`, async route => { attempts++; await route.abort("failed"); });
    await page.goto(`/${locale}/communities/${id}`);
    const button = page.getByRole("button", { name: text.more, exact: true });
    await button.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(paging.failed);
    await expect(page.getByRole("article")).toHaveCount(20); expect(attempts).toBe(1);
    await page.unroute(`**/communities/${id}/posts?after=*`);
    await page.getByRole("button", { name: paging.retry, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("article")).toHaveCount(23);
    await expect(page.locator("article:focus")).toHaveCount(1);
    await expect(page.getByRole("button", { name: text.more, exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  });
}
