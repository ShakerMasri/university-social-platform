import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { voteText } from "../../src/i18n/votes";
import { replyText } from "../../src/i18n/replies";
import { commentText } from "../../src/i18n/comments";
import { notificationText } from "../../src/i18n/notifications";
import { paginationText } from "../../src/i18n/pagination";


test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100", communities: string[] = [];
const post = (request: APIRequestContext, path: string, data: object) => request.post(path, { data, headers: { Origin: origin } });
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
      await client.query('DELETE FROM "Notification" WHERE "postId" IN (SELECT id FROM "Post" WHERE "communityId"=ANY($1::uuid[]))', [communities]);
      await client.query('DELETE FROM "Comment" WHERE "rootId" IS NOT NULL AND "postId" IN (SELECT id FROM "Post" WHERE "communityId"=ANY($1::uuid[]))', [communities]);
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
  test(`${locale}: inbox opens a deep reply by keyboard, preserves read state, and marks all read`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context), target = await content(context, id), text = notificationText[locale];
    const member = await browser.newContext({ baseURL: origin });
    try {
      const author = await signIn(member); await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
      const roots = Array.from({ length: 22 }, () => randomUUID());
      await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Older root\' FROM unnest($1::uuid[]) id', [roots, target.postId, author]));
      const path = `/api/communities/${id}/posts/${target.postId}/comments`;
      const rootResponse = await post(member.request, path, { requestId: randomUUID(), body: "Deep root تعليق" });
      const root = (await rootResponse.json()).id as string;
      const replies = Array.from({ length: 22 }, () => randomUUID());
      await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId") SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Older reply\',$4::uuid,$4::uuid FROM unnest($1::uuid[]) id', [replies, target.postId, author, root]));
      const replyResponse = await post(member.request, path, { requestId: randomUUID(), body: "Deep linked reply رد", replyToId: root });
      const reply = (await replyResponse.json()).id as string;
      const inbox = await (await context.request.get("/api/notifications")).json() as { items: { id: string }[]; unread: number };
      expect(inbox.unread).toBe(2);
      const page = await context.newPage(); await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`/${locale}/notifications`);
      await expect(page.getByRole("heading", { name: text.title, exact: true })).toBeVisible();
      const newest = page.locator(`#notification-${inbox.items[0].id}`);
      await newest.getByRole("button", { name: text.open }).focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`notification=${inbox.items[0].id}`));
      await expect(page.locator(`#comment-${root}`)).toBeVisible(); await expect(page.locator(`#comment-${reply}`)).toContainText("Deep linked reply رد");
      await expect(page.getByRole("button", { name: replyText[locale].first, exact: true })).toBeVisible();
      await page.getByRole("link", { name: text.title, exact: true }).click();
      await expect(page.locator(`#notification-${inbox.items[0].id}`).locator("p").first()).toHaveText(`${text.read} · ${text.comment}`);
      await page.getByRole("button", { name: text.markAll, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: text.marked })).toBeFocused();
      await expect(page.getByRole("button", { name: text.markAll, exact: true })).toBeDisabled();
      expect((await (await context.request.get("/api/notifications")).json()).unread).toBe(0);
      await page.reload(); await expect(page.locator("main article").filter({ hasText: text.unread })).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await member.close(); }
  });

  test(`${locale}: public membership removal hides inbox links and rejoin restores old unread records`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context), text = notificationText[locale], member = await browser.newContext({ baseURL: origin });
    try {
      await signIn(member); await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
      const announcement = await content(context, id, "ANNOUNCEMENT");
      const old = (await (await member.request.get("/api/notifications")).json()).items[0] as { id: string };
      const page = await member.newPage(); await page.goto(`/${locale}/notifications`); await expect(page.locator(`#notification-${old.id}`)).toBeVisible();
      await post(member.request, `/api/communities/${id}/memberships`, { action: "leave" });
      await page.locator(`#notification-${old.id}`).getByRole("button", { name: text.open }).click();
      await expect(page.locator("main article")).toHaveCount(0); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
      expect((await post(member.request, `/api/notifications/${old.id}/open`, {})).status()).toBe(404);
      const link = `/${locale}/communities/${id}/posts/${announcement.postId}?notification=${old.id}`;
      const inaccessible = await (await member.request.get(link)).text(); expect(inaccessible).not.toContain("Vote ANNOUNCEMENT");
      expect((await member.request.get(`/api/communities/${id}/posts/${announcement.postId}`)).status()).toBe(200);
      await content(context, id, "ANNOUNCEMENT");
      await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
      await page.reload(); await expect(page.locator(`#notification-${old.id}`)).toContainText(text.unread);
      expect((await (await member.request.get("/api/notifications")).json()).items).toHaveLength(1);
      await page.goto(link); await expect(page.getByRole("heading", { name: "Vote ANNOUNCEMENT" })).toBeVisible();
    } finally { await member.close(); }
  });
  test(`${locale}: reply loading failures and page retries preserve keyboard access`, async ({ context, page }) => {
    const author = await signIn(context), id = await space(context), target = await content(context, id), text = replyText[locale], paging = paginationText[locale];
    const endpoint = `/api/communities/${id}/posts/${target.postId}/comments/${target.commentId}/replies`;
    await page.route(`**${endpoint}`, route => route.abort("failed"));
    await page.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
    await page.getByRole("button", { name: text.show, exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.failed);
    await page.unroute(`**${endpoint}`);
    await page.getByRole("button", { name: text.show, exact: true }).click();
    await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId") SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Paged reply\',$4::uuid,$4::uuid FROM unnest($1::uuid[]) id', [ids, target.postId, author, target.commentId]));
    await page.reload();
    await page.route(`**${endpoint}?after=*`, route => route.abort("failed"));
    await page.getByRole("button", { name: text.show, exact: true }).click();
    await page.getByRole("button", { name: text.more, exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(paging.failed);
    await expect(page.locator(".comment-replies article")).toHaveCount(20);
    await page.unroute(`**${endpoint}?after=*`);
    await page.getByRole("button", { name: paging.retry, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".comment-replies article")).toHaveCount(23);
    await expect(page.locator(".comment-replies article:focus")).toHaveCount(1);
  });
  test(`${locale}: notification preferences save by keyboard with localized feedback`, async ({ context, page }) => {
    await signIn(context); await page.goto(`/${locale}/profile`);
    const text = notificationText[locale], settings = page.getByRole("region", { name: text.settings });
    await expect(settings.getByRole("checkbox", { name: text.announcements })).toBeChecked();
    await settings.getByRole("checkbox", { name: text.announcements }).focus(); await page.keyboard.press("Space");
    await settings.getByRole("button", { name: text.save, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(settings.getByRole("status")).toHaveText(text.saved); await expect(settings.getByRole("status")).toBeFocused();
    await page.reload(); await expect(settings.getByRole("checkbox", { name: text.announcements })).not.toBeChecked();
    await expect(settings.getByRole("checkbox", { name: text.replies })).toBeChecked();
    await page.route("**/api/notifications/preferences", route => route.abort("failed"));
    await settings.getByRole("button", { name: text.save, exact: true }).click();
    await expect(settings.getByRole("status")).toHaveText(text.failed); await expect(settings.getByRole("status")).toBeFocused();
  });
  test(`${locale}: a failed reply read preserves confirmed publication and the next draft`, async ({ context, page }) => {
    await signIn(context); const id = await space(context), target = await content(context, id), text = replyText[locale];
    const endpoint = `/api/communities/${id}/posts/${target.postId}/comments/${target.commentId}/replies`;
    await page.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
    const thread = page.locator(`#comment-${target.commentId}`).locator("..");
    await thread.getByRole("button", { name: text.reply, exact: true }).click();
    const body = thread.getByRole("textbox", { name: text.body, exact: true });
    await body.fill("Confirmed reply survives a read failure");
    await thread.getByRole("button", { name: text.publish, exact: true }).click();
    const confirmed = thread.getByText("Confirmed reply survives a read failure", { exact: true });
    await expect(confirmed).toBeVisible();
    await body.fill("Unsubmitted next draft");
    await page.route(`**${endpoint}`, route => route.abort("failed"));
    await thread.getByRole("button", { name: text.show, exact: true }).click();
    await expect(thread.getByRole("alert")).toHaveText(text.failed);
    await expect(confirmed).toBeVisible();
    await expect(body).toHaveValue("Unsubmitted next draft");
    await page.unroute(`**${endpoint}`);
    await thread.getByRole("button", { name: text.show, exact: true }).click();
    await expect(thread.locator(".comment-replies article")).toHaveCount(1);
    await expect(body).toHaveValue("Unsubmitted next draft");
  });
  test(`${locale}: keyboard replies to replies stay flat, show addressees and survive lost responses`, async ({ context, browser }) => {
    await signIn(context); const id = await space(context), target = await content(context, id), text = replyText[locale];
    const member = await browser.newContext({ baseURL: origin });
    try {
      await signIn(member); await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
      const page = await member.newPage(); await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
      const root = page.locator(`#comment-${target.commentId}`), thread = root.locator("..");
      await root.getByRole("button", { name: text.reply, exact: true }).focus(); await page.keyboard.press("Enter");
      const body = thread.getByRole("textbox", { name: text.body, exact: true }); await expect(body).toBeFocused();
      await body.fill("Reply <script>inert</script> رد");
      const path = `/api/communities/${id}/posts/${target.postId}/comments`;
      await page.route(`**${path}`, async route => {
        if (route.request().method() === "POST") { await route.fetch(); await route.abort("failed"); }
        else await route.continue();
      });
      await thread.getByRole("button", { name: text.publish, exact: true }).click();
      await expect(thread.getByRole("status").filter({ hasText: commentText[locale].failed })).toBeFocused();
      await page.unroute(`**${path}`);
      await thread.getByRole("button", { name: text.publish, exact: true }).click();
      await expect(thread.getByRole("region", { name: commentText[locale].justPublished }).getByText("Reply <script>inert</script> رد", { exact: true })).toBeVisible();
      const first = (await (await member.request.get(`${path}/${target.commentId}/replies`)).json()).items[0] as { id: string };
      await expect(thread.locator(`#comment-${first.id}`)).toContainText(text.replyingTo);
      await expect(thread.locator(`#comment-${first.id}`)).toContainText("كاتب Voter 😀");
      await thread.locator(`#comment-${first.id}`).getByRole("button", { name: text.reply, exact: true }).click();
      await expect(body).toBeFocused(); await body.fill("Reply to reply رد ثانٍ");
      await thread.getByRole("button", { name: text.publish, exact: true }).click();
      await expect(thread.getByText("Reply to reply رد ثانٍ", { exact: true })).toBeVisible();
      await page.reload(); await page.getByRole("button", { name: text.show, exact: true }).click();
      await expect(thread.locator(".comment-replies article")).toHaveCount(2);
      await expect(thread.locator(".comment-replies .comment-replies")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      expect(await page.locator("main script").count()).toBe(0);
      const ownerPage = await context.newPage(); await ownerPage.goto(`/${locale}/communities/${id}/posts/${target.postId}`);
      await ownerPage.getByRole("button", { name: text.show, exact: true }).click();
      await ownerPage.locator(`#comment-${first.id}`).getByRole("button", { name: voteText[locale].add, exact: true }).click();
      await expect(ownerPage.locator(`#comment-${first.id}`).getByRole("button", { name: voteText[locale].remove, exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(await fixture(async client => (await client.query('SELECT count(*) FROM "Notification" WHERE "postId"=$1', [target.postId])).rows[0].count)).toBe("2");
    } finally { await member.close(); }
  });
}

test("a superseded inbox response cannot restore the unread count after mark-all refresh", async ({ context, browser }) => {
  await signIn(context); const id = await space(context), member = await browser.newContext({ baseURL: origin });
  try {
    const recipient = await signIn(member);
    await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
    await fixture(async client => {
      for (let index = 0; index < 23; index++) {
        const postId = randomUUID();
        await client.query('INSERT INTO "Post" (id,"communityId",type,title,body) VALUES ($1,$2,\'ANNOUNCEMENT\',\'Delayed inbox\',\'Body\')', [postId, id]);
        await client.query('INSERT INTO "Notification" (id,"recipientId","postId","eventKey",kind) VALUES ($1,$2,$3,$3,\'ANNOUNCEMENT\')', [randomUUID(), recipient, postId]);
      }
    });
    // Delay only the first pagination body's delivery, after the server has
    // authorized it. A refresh must invalidate it even during JSON decoding.
    const inbox = await member.newPage();
    await inbox.addInitScript(() => {
      Object.defineProperty(window, "IntersectionObserver", { value: undefined });
      const json = Response.prototype.json;
      let delayed = false;
      Response.prototype.json = async function () {
        const value: unknown = await json.call(this);
        if (!delayed && this.url.includes("/api/notifications?after=")) {
          delayed = true;
          document.documentElement.dataset.inboxBodyWaiting = "true";
          await new Promise<void>(resolve => document.addEventListener("release-inbox-body", () => resolve(), { once: true }));
          document.documentElement.dataset.inboxBodyReleased = "true";
        }
        return value;
      };
    });
    await inbox.goto("/en/notifications");
    await inbox.getByRole("button", { name: notificationText.en.more, exact: true }).click();
    await expect(inbox.locator("html")).toHaveAttribute("data-inbox-body-waiting", "true");
    await inbox.getByRole("button", { name: notificationText.en.markAll, exact: true }).click();
    await expect(inbox.getByText("Unread: 0", { exact: true })).toBeVisible();
    await inbox.evaluate(async () => {
      document.dispatchEvent(new Event("release-inbox-body"));
      // Let the released promise and any React state updates commit before
      // checking; an immediate assertion could observe the pre-release zero.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect(inbox.locator("html")).toHaveAttribute("data-inbox-body-released", "true");
    await expect(inbox.getByText("Unread: 0", { exact: true })).toBeVisible();
    await expect(inbox.getByRole("button", { name: notificationText.en.markAll, exact: true })).toBeDisabled();
  } finally { await member.close(); }
});

test("a denied reply read clears local publication and the composer after private membership removal", async ({ context, browser }) => {
  await signIn(context); const id = await space(context, "PRIVATE"), target = await content(context, id);
  const member = await browser.newContext({ baseURL: origin });
  try {
    const userId = await signIn(member);
    await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
    await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId });
    const page = await member.newPage(); await page.goto(`/en/communities/${id}/posts/${target.postId}`);
    const thread = page.locator(`#comment-${target.commentId}`).locator("..");
    await thread.getByRole("button", { name: replyText.en.reply, exact: true }).click();
    const body = thread.getByRole("textbox", { name: replyText.en.body, exact: true });
    await body.fill("Private locally published reply");
    await thread.getByRole("button", { name: replyText.en.publish, exact: true }).click();
    await expect(page.getByText("Private locally published reply", { exact: true })).toBeVisible();
    await body.fill("Private next draft");
    expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId })).status()).toBe(200);
    await thread.getByRole("button", { name: replyText.en.show, exact: true }).click();
    await expect(page.getByText("Private locally published reply", { exact: true })).toHaveCount(0);
    await expect(body).toHaveCount(0);
    await expect(page.locator(`#comment-${target.commentId}`)).toHaveCount(0);
  } finally { await member.close(); }
});

test("reply routes enforce parent isolation, CSRF and private revocation; settings cannot target another user", async ({ context, browser }) => {
  await signIn(context); const id = await space(context, "PRIVATE"), target = await content(context, id), other = await content(context, id);
  const member = await browser.newContext({ baseURL: origin });
  try {
    const userId = await signIn(member); await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
    const path = `/api/communities/${id}/posts/${target.postId}/comments`, replies = `${path}/${target.commentId}/replies`;
    expect((await member.request.get(replies)).status()).toBe(404);
    await post(context.request, `/api/communities/${id}/memberships`, { action: "approve", userId });
    const data = { requestId: randomUUID(), body: "Reply", replyToId: target.commentId };
    expect((await post(member.request, path, { ...data, replyToId: other.commentId })).status()).toBe(404);
    expect((await member.request.post(path, { data, headers: { Origin: "https://attacker.invalid" } })).status()).toBe(403);
    const saved = await post(member.request, path, data); expect(saved.status()).toBe(201);
    const response = await member.request.get(replies); expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(Object.keys((await response.json()).items[0]).sort()).toEqual(["authorName", "body", "createdAt", "id", "replyToId", "replyToName", "rootId", "vote"]);
    expect((await member.request.put("/api/notifications/preferences", { data: { announcements: false, replies: true, userId }, headers: { Origin: origin } })).status()).toBe(400);
    expect((await member.request.put("/api/notifications/preferences", { data: { announcements: false, replies: true }, headers: { Origin: origin } })).status()).toBe(200);
    expect(await (await context.request.get("/api/notifications/preferences")).json()).toMatchObject({ announcements: true, replies: true });
    await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId });
    expect((await member.request.get(replies)).status()).toBe(404);
    expect((await post(member.request, path, data)).status()).toBe(404);
    const html = await (await member.request.get(`/en/communities/${id}/posts/${target.postId}`)).text();
    expect(html).not.toContain("Comment target");
  } finally { await member.close(); }
});

test("inbox pagination drops revoked communities and HTTP boundaries isolate owners and CSRF", async ({ context, browser }) => {
  await signIn(context); const removed = await space(context, "PRIVATE"), kept = await space(context), member = await browser.newContext({ baseURL: origin });
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const recipient = await signIn(member);
    for (const id of [removed, kept]) await post(member.request, `/api/communities/${id}/memberships`, { action: "join" });
    await post(context.request, `/api/communities/${removed}/memberships`, { action: "approve", userId: recipient });
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await fixture(async client => {
      for (const [index, id] of ids.entries()) {
        await client.query('INSERT INTO "Post" (id,"communityId",type,title,body) VALUES ($1,$2,\'ANNOUNCEMENT\',$3,\'Body\')', [id, index < 2 ? removed : kept, index < 2 ? "Private notification title" : "Kept notification title"]);
        await client.query('INSERT INTO "Notification" (id,"recipientId","postId","eventKey",kind,"createdAt") VALUES ($1,$2,$3,$3,\'ANNOUNCEMENT\',now()-($4::int*interval \'1 second\'))', [randomUUID(), recipient, id, index]);
      }
    });
    const initialResponse = await member.request.get("/api/notifications"), initial = await initialResponse.json();
    expect(initialResponse.headers()["cache-control"]).toBe("private, no-store");
    expect(initial.items).toHaveLength(20); expect(initial.unread).toBe(23);
    expect(Object.keys(initial.items[0]).sort()).toEqual(["createdAt", "id", "kind", "read", "title"]);
    expect((await anonymous.request.get("/api/notifications")).status()).toBe(401);
    expect((await post(context.request, `/api/notifications/${initial.items[0].id}/open`, {})).status()).toBe(404);
    expect((await context.request.get(`/api/notifications?after=${initial.items[0].id}`)).status()).toBe(404);
    expect((await member.request.post("/api/notifications/read-all", { data: {}, headers: { Origin: "https://attacker.invalid" } })).status()).toBe(403);
    expect((await member.request.post(`/api/notifications/${initial.items[0].id}/open`, { data: {}, headers: { Origin: "https://attacker.invalid" } })).status()).toBe(403);
    expect((await post(member.request, "/api/notifications/read-all", { userId: recipient })).status()).toBe(400);
    expect((await post(member.request, `/api/notifications/${initial.items[0].id}/open`, { readAt: "forged" })).status()).toBe(400);
    const page = await member.newPage(); await page.goto("/en/notifications");
    await expect(page.getByText("Private notification title", { exact: true })).toHaveCount(2);
    await post(context.request, `/api/communities/${removed}/memberships`, { action: "remove", userId: recipient });
    await page.getByRole("button", { name: notificationText.en.more, exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText("Private notification title", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Unread: 21", { exact: true })).toBeVisible();
    const fresh = await (await member.request.get("/api/notifications")).json(); expect(fresh.scope).not.toBe(initial.scope);
    expect((await member.request.get(`/api/notifications?after=${initial.items[0].id}`)).status()).toBe(404);
    await page.route("**/api/notifications/read-all", route => route.abort("failed"));
    await page.getByRole("button", { name: notificationText.en.markAll, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: notificationText.en.failed })).toBeFocused();
    await page.unroute("**/api/notifications/read-all");
    await page.getByRole("button", { name: notificationText.en.markAll, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: notificationText.en.marked })).toBeFocused();
    await expect(page.getByRole("button", { name: notificationText.en.markAll, exact: true })).toBeDisabled();
    expect(await fixture(async client => (await client.query('SELECT count(*) FROM "Notification" WHERE "recipientId"=$1 AND "readAt" IS NULL', [recipient])).rows[0].count)).toBe("2");
  } finally { await member.close(); await anonymous.close(); }
});

