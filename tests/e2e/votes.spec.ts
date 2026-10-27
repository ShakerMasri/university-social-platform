import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { digest } from "../../src/server/identity/policy";
import { voteText } from "../../src/i18n/votes";
import { postText } from "../../src/i18n/posts";

test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100", communities: string[] = [];
const post = (request: APIRequestContext, path: string, data: object) => request.post(path, { data, headers: { Origin: origin } });
const vote = (request: APIRequestContext, path: string, active: boolean, headers: Record<string, string> = {}) => request.put(path, { data: { active }, headers: { Origin: origin, ...headers } });
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable voting browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic voting fixture failed; credentials omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
test.afterAll(async () => {
  await fixture(async client => {
    await client.query("BEGIN");
    try {
      await client.query('DELETE FROM "CommentVote" WHERE "commentId" IN (SELECT c.id FROM "Comment" c JOIN "Post" p ON p.id=c."postId" WHERE p."communityId"=ANY($1::uuid[]))', [communities]);
      await client.query('DELETE FROM "PostVote" WHERE "postId" IN (SELECT id FROM "Post" WHERE "communityId"=ANY($1::uuid[]))', [communities]);
      await client.query('DELETE FROM "Comment" WHERE "postId" IN (SELECT id FROM "Post" WHERE "communityId"=ANY($1::uuid[]))', [communities]);
      await client.query('DELETE FROM "Post" WHERE "communityId"=ANY($1::uuid[])', [communities]);
      await client.query('DELETE FROM "CommunityMembership" WHERE "communityId"=ANY($1::uuid[])', [communities]);
      await client.query('DELETE FROM "Community" WHERE id=ANY($1::uuid[])', [communities]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  });
});
async function signIn(context: BrowserContext, profile = true) {
  const email = `vote.${randomUUID()}@university.test`;
  expect((await post(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await post(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (profile) expect((await post(context.request, "/api/identity/profile", { displayName: "كاتب Voter 😀" })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function space(context: BrowserContext, visibility = "PUBLIC") {
  const response = await post(context.request, "/api/communities", { name: `Votes ${randomUUID()}`, description: "", visibility });
  expect(response.status()).toBe(201); const id = (await response.json() as { id: string }).id; communities.push(id); return id;
}
async function content(context: BrowserContext, id: string, type = "QUESTION") {
  const response = await post(context.request, `/api/communities/${id}/posts`, { requestId: randomUUID(), type, title: `Vote ${type}`, body: "<script>inert</script> محتوى" });
  expect(response.status()).toBe(201); const postId = (await response.json() as { id: string }).id;
  const saved = await post(context.request, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "تعليق Comment target" });
  expect(saved.status()).toBe(201); const commentId = (await saved.json() as { id: string }).id;
  return { postId, commentId, postPath: `/api/communities/${id}/posts/${postId}/vote`, commentPath: `/api/communities/${id}/posts/${postId}/comments/${commentId}/vote` };
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: profileless members toggle persisted post/comment upvotes by keyboard on all four types`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context), text = voteText[locale];
    const memberContext = await browser.newContext({ baseURL: origin });
    try {
      await signIn(memberContext, false);
      expect((await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
      const page = await memberContext.newPage(); await page.setViewportSize({ width: 360, height: 800 });
      for (const type of ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"]) {
        const target = await content(context, id, type);
        await page.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        for (const targetId of [`post-${target.postId}`, `comment-${target.commentId}`]) {
          const group = page.locator(`#${targetId}`).getByRole("group", { name: text.group });
          await group.getByRole("button", { name: text.add, exact: true }).focus(); await page.keyboard.press("Enter");
          await expect(group.getByRole("button", { name: text.remove, exact: true })).toHaveAttribute("aria-pressed", "true");
          await expect(group).toContainText(text.saved);
          await expect(group).toContainText(`${text.count}: ${(1).toLocaleString(locale)}`);
          await page.reload();
          await expect(group.getByRole("button", { name: text.remove, exact: true })).toHaveAttribute("aria-pressed", "true");
          await group.getByRole("button", { name: text.remove, exact: true }).focus(); await page.keyboard.press("Enter");
          await expect(group).toContainText(text.removed);
          await expect(group.getByRole("button", { name: text.add, exact: true })).toHaveAttribute("aria-pressed", "false");
          await expect(group).toContainText(`${text.count}: ${(0).toLocaleString(locale)}`);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await page.locator("main script").count()).toBe(0);
      }
      const ownerPage = await context.newPage(); await ownerPage.goto(`/${locale}/communities/${id}`);
      await expect(ownerPage.getByRole("button", { name: text.add, exact: true })).toHaveCount(0);
    } finally { await memberContext.close(); }
  });

  test(`${locale}: an ambiguous add or removal keeps its desired state for a safe retry`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context), target = await content(context, id), text = voteText[locale];
    const memberContext = await browser.newContext({ baseURL: origin });
    try {
      await signIn(memberContext); await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" });
      const page = await memberContext.newPage(); await page.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
      for (const [targetId, path] of [[`post-${target.postId}`, target.postPath], [`comment-${target.commentId}`, target.commentPath]]) {
        const group = page.locator(`#${targetId}`).getByRole("group", { name: text.group });
        for (const active of [true, false]) {
          let release: () => void = () => {}, reached: () => void = () => {};
          const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
          await page.route(`**${path}`, async route => { await route.fetch(); reached(); await hold; await route.abort("failed"); });
          try {
            await group.getByRole("button", { name: active ? text.add : text.remove, exact: true }).click(); await ready;
            await expect(group.getByRole("button", { name: text.busy, exact: true })).toBeDisabled();
            release(); await expect(group).toContainText(text.failed);
            await expect(group.getByRole("button", { name: text.retry, exact: true })).toHaveAttribute("aria-pressed", String(!active));
          } finally { release(); await page.unroute(`**${path}`); }
          await group.getByRole("button", { name: text.retry, exact: true }).focus(); await page.keyboard.press("Enter");
          await expect(group.getByRole("button", { name: active ? text.remove : text.add, exact: true })).toHaveAttribute("aria-pressed", String(active));
          await expect(group).toContainText(`${text.count}: ${(active ? 1 : 0).toLocaleString(locale)}`);
        }
      }
    } finally { await memberContext.close(); }
  });
}

test("votes: forged authority, input bounds, CSRF, self-votes, scoped parents and durable limit", async ({ context, browser }) => {
  const owner = await signIn(context), id = await space(context), target = await content(context, id), other = await content(context, id);
  const memberContext = await browser.newContext({ baseURL: origin });
  try {
    const member = await signIn(memberContext, false);
    for (const path of [target.postPath, target.commentPath]) {
      expect((await vote(context.request, path, true)).status()).toBe(403);
      expect((await vote(memberContext.request, path, true, { "X-User-Id": owner, "X-Role": "teacher" })).status()).toBe(403);
    }
    await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" });
    for (const path of [target.postPath, target.commentPath]) {
      for (const data of [{}, { active: 1 }, { active: "true" }, { active: true, userId: owner }, { active: true, count: 99 }, { active: true, extra: "x".repeat(1100) }]) expect((await memberContext.request.put(path, { data, headers: { Origin: origin } })).status()).toBe(400);
      expect((await vote(memberContext.request, path, true, { Origin: "https://attacker.invalid" })).status()).toBe(403);
      const responses = await Promise.all([vote(memberContext.request, path, true), vote(memberContext.request, path, true)]);
      for (const response of responses) {
        expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
        expect(await response.json()).toEqual({ ok: true, count: 1, active: true, canVote: true });
      }
    }
    expect((await vote(memberContext.request, target.commentPath.replace(target.postId, other.postId), true)).status()).toBe(404);
    const key = digest(`m3-vote-write:${member}`);
    await fixture(client => client.query('UPDATE "IdentityRateLimit" SET hits=30,"startedAt"=clock_timestamp() WHERE "keyDigest"=$1', [key]));
    expect((await vote(memberContext.request, target.postPath, false)).status()).toBe(429);
    const page = await memberContext.newPage(); await page.goto(`/en/communities/${id}/posts/${target.postId}`);
    const group = page.locator(`#post-${target.postId}`).getByRole("group", { name: voteText.en.group });
    await group.getByRole("button", { name: voteText.en.remove, exact: true }).click();
    await expect(group).toContainText(voteText.en.rate);
    await expect(group.getByRole("button", { name: voteText.en.retry, exact: true })).toHaveAttribute("aria-pressed", "true");
  } finally { await memberContext.close(); }
});

for (const kind of ["post", "comment"] as const) {
  test(`votes: ${kind} denial after private membership removal refreshes away content`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context, "PRIVATE"), target = await content(context, id);
    const memberContext = await browser.newContext({ baseURL: origin });
    try {
      const member = await signIn(memberContext);
      await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" });
      expect((await vote(memberContext.request, target.postPath, true)).status()).toBe(404);
      await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId: member });
      const page = await memberContext.newPage(); await page.goto(`/en/communities/${id}/posts/${target.postId}`);
      const group = page.locator(`#${kind}-${kind === "post" ? target.postId : target.commentId}`).getByRole("group", { name: voteText.en.group });
      await expect(group.getByRole("button", { name: voteText.en.add, exact: true })).toBeVisible();
      await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId: member });
      await group.getByRole("button", { name: voteText.en.add, exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(page.getByRole("group", { name: voteText.en.group })).toHaveCount(0);
    } finally { await memberContext.close(); }
  });
}

test("votes: a late confirmation cannot change another post after client navigation", async ({ context, browser }) => {
  await signIn(context); const id = await space(context), target = await content(context, id), other = await content(context, id);
  const memberContext = await browser.newContext({ baseURL: origin }); let release: () => void = () => {};
  try {
    await signIn(memberContext); await post(memberContext.request, `/api/communities/${id}/memberships`, { action: "join" });
    const page = await memberContext.newPage(); let reached: () => void = () => {};
    const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
    await page.route(`**${target.postPath}`, async route => {
      const response = await route.fetch(); reached(); await hold;
      try { await route.fulfill({ response }); } catch { /* Canceled when its control unmounts. */ }
    });
    await page.goto(`/en/communities/${id}/posts/${target.postId}`);
    await page.locator(`#post-${target.postId}`).getByRole("button", { name: voteText.en.add, exact: true }).click(); await ready;
    await page.getByRole("link", { name: postText.en.back, exact: true }).click();
    await page.locator(`a[href="/en/communities/${id}/posts/${other.postId}"]`).click(); release();
    const group = page.locator(`#post-${other.postId}`).getByRole("group", { name: voteText.en.group });
    await expect(group.getByRole("button", { name: voteText.en.add, exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(group).toContainText(`${voteText.en.count}: 0`);
    await expect(page.locator(`#post-${target.postId}`)).toHaveCount(0);
  } finally { release(); await memberContext.close(); }
});
