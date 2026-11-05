import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { archiveText } from "../../src/i18n/archive";
import { postText } from "../../src/i18n/posts";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const write = (request: APIRequestContext, path: string, data: object) => request.post(path, { data, headers: { Origin: origin } });
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable archive browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic archive fixture failed; credentials omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
async function signIn(context: BrowserContext, profile = true) {
  const email = `archive.${randomUUID()}@university.test`;
  expect((await write(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await write(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (profile) expect((await write(context.request, "/api/identity/profile", { displayName: "دارس Archive" })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function space(request: APIRequestContext, visibility = "PRIVATE") {
  const response = await write(request, "/api/communities", { name: `Archive ${randomUUID()}`, description: "", visibility }); expect(response.status()).toBe(201); return (await response.json()).id as string;
}
async function post(request: APIRequestContext, community: string, title: string, type = "DISCUSSION", body = "Synthetic explanation") {
  const response = await write(request, `/api/communities/${community}/posts`, { requestId: randomUUID(), type, title, body }); expect(response.status()).toBe(201); return (await response.json()).id as string;
}
type SnapshotBrowser = Window & {
  next: { router: { refresh(): void; push(path: string): void } };
  archiveDocumentProbe?: string;
  archiveBodyHold?: { reached: boolean; delivered: boolean; release(): void };
};
const archiveRequest = (page: Page) => page.waitForRequest(request => new URL(request.url()).pathname === "/api/archive");
async function refreshArchive(page: Page) {
  // The installed Next 16.4.3 exposes the real public router here. Invoke its
  // actual refresh, assert a real RSC response, and preserve the document.
  const response = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/archive") && response.request().headers().rsc === "1");
  await page.evaluate(() => (window as unknown as SnapshotBrowser).next.router.refresh());
  expect((await response).status()).toBe(200);
}
async function snapshotReset(page: Page, locale: "en" | "ar", community = "") {
  const text = archiveText[locale];
  await expect(page.getByLabel(text.query, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(text.community, { exact: true })).toHaveValue(community);
  await expect(page.getByLabel(postText[locale].type, { exact: true })).toHaveValue("");
  await expect(page.locator(".archive-result")).toHaveCount(0);
  await expect(page.getByRole("button", { name: text.next, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: text.retry, exact: true })).toHaveCount(0);
  await expect(page.getByText(text.initial, { exact: true })).toBeVisible();
}
async function seedSnapshotPosts(community: string, author: string, marker: string) {
  const ids = Array.from({ length: 23 }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',$4,\'Synthetic private snapshot excerpt\' FROM unnest($1::uuid[]) id', [ids, community, author, marker]));
}
async function holdArchiveBody(page: Page) {
  await page.evaluate(() => {
    const browser = window as unknown as SnapshotBrowser, originalFetch = window.fetch;
    let release!: () => void, once = true;
    const gate = new Promise<void>(done => { release = done; });
    browser.archiveBodyHold = { reached: false, delivered: false, release: () => { window.fetch = originalFetch; release(); } };
    // Keep the real request, authentication and response. Delay only parsed-body
    // delivery; aborting transport cannot discard this already-read promise.
    window.fetch = async (...args) => {
      const response = await originalFetch(...args), input = args[0];
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href).pathname;
      if (path === "/api/archive" && once) {
        once = false; const json = response.json.bind(response);
        response.json = async () => {
          const value: unknown = await json(); browser.archiveBodyHold!.reached = true;
          await gate; browser.archiveBodyHold!.delivered = true; return value;
        };
      }
      return response;
    };
  });
}
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: server snapshot resets scoped header navigation and unchanged unscoped retry state`, async ({ context, page }) => {
    const owner = await signIn(context), community = await space(context.request), text = archiveText[locale], marker = `snapshot${randomUUID()}`;
    await seedSnapshotPosts(community, owner, marker); const secondCommunity = await space(context.request);
    await post(context.request, secondCommunity, marker, "QUESTION");
    await page.goto(`/${locale}/archive?community=${community}`);
    const documentProbe = randomUUID(); await page.evaluate(value => { (window as unknown as SnapshotBrowser).archiveDocumentProbe = value; }, documentProbe);
    await page.getByLabel(text.query, { exact: true }).fill(marker); await page.getByLabel(postText[locale].type, { exact: true }).selectOption("QUESTION");
    await page.getByRole("button", { name: text.submit, exact: true }).click(); await expect(page.locator(".archive-result")).toHaveCount(20);
    await page.evaluate(path => (window as unknown as SnapshotBrowser).next.router.push(path), `/${locale}/archive?community=${secondCommunity}`);
    await expect(page).toHaveURL(`${origin}/${locale}/archive?community=${secondCommunity}`); await snapshotReset(page, locale, secondCommunity);
    await page.getByLabel(text.query, { exact: true }).fill(marker); const scoped = archiveRequest(page);
    await page.getByRole("button", { name: text.submit, exact: true }).click();
    expect(new URL((await scoped).url()).searchParams.get("community")).toBe(secondCommunity); await expect(page.locator(".archive-result")).toHaveCount(1);
    await page.getByRole("banner").getByRole("link", { name: text.title, exact: true }).click();
    await expect(page).toHaveURL(`${origin}/${locale}/archive`); await snapshotReset(page, locale);
    expect(await page.evaluate(() => (window as unknown as SnapshotBrowser).archiveDocumentProbe)).toBe(documentProbe);
    await page.getByLabel(text.query, { exact: true }).fill(marker);
    const request = archiveRequest(page); await page.getByRole("button", { name: text.submit, exact: true }).click();
    const params = new URL((await request).url()).searchParams; expect(params.get("community")).toBeNull(); expect(params.get("type")).toBeNull(); expect(params.get("after")).toBeNull();
    await expect(page.locator(".archive-result")).toHaveCount(20);
    await page.route("**/api/archive?*", route => route.fulfill({ status: 503, json: { ok: false } }), { times: 1 });
    await page.getByRole("button", { name: text.next, exact: true }).click(); await expect(page.getByRole("button", { name: text.retry, exact: true })).toBeVisible();
    // Scope and choices are unchanged: every fresh authorized snapshot resets.
    await refreshArchive(page); await snapshotReset(page, locale);
    await page.getByLabel(text.query, { exact: true }).fill(marker);
    const restarted = archiveRequest(page); await page.getByRole("button", { name: text.submit, exact: true }).click();
    expect(new URL((await restarted).url()).searchParams.get("after")).toBeNull(); await expect(page.locator(".archive-result")).toHaveCount(20);
  });
  test(`${locale}: server snapshot clears revoked private results on a real unscoped refresh`, async ({ context, browser }) => {
    const owner = await signIn(context), community = await space(context.request), text = archiveText[locale], marker = `revokedsnapshot${randomUUID()}`;
    await seedSnapshotPosts(community, owner, marker); const reader = await browser.newContext();
    try {
      const readerId = await signIn(reader, false);
      expect((await write(reader.request, `/api/communities/${community}/memberships`, { action: "join" })).status()).toBe(200);
      expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "approve", userId: readerId })).status()).toBe(200);
      const page = await reader.newPage(); await page.goto(`/${locale}/archive`);
      const probe = randomUUID(); await page.evaluate(value => { (window as unknown as SnapshotBrowser).archiveDocumentProbe = value; }, probe);
      await page.getByLabel(text.community, { exact: true }).selectOption(community); await page.getByLabel(text.query, { exact: true }).fill(marker);
      await page.getByRole("button", { name: text.submit, exact: true }).click(); await expect(page.locator(".archive-result")).toHaveCount(20);
      await expect(page.getByRole("button", { name: text.next, exact: true })).toBeVisible();
      expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "remove", userId: readerId })).status()).toBe(200);
      await refreshArchive(page); await expect(page.locator(`#archive-community option[value="${community}"]`)).toHaveCount(0);
      await snapshotReset(page, locale); expect(await page.evaluate(() => (window as unknown as SnapshotBrowser).archiveDocumentProbe)).toBe(probe);
      await page.getByLabel(text.query, { exact: true }).fill(marker);
      const request = archiveRequest(page); await page.getByRole("button", { name: text.submit, exact: true }).click();
      const params = new URL((await request).url()).searchParams; expect(params.get("community")).toBeNull(); expect(params.get("after")).toBeNull();
      await expect(page.getByText(text.empty, { exact: true })).toBeVisible(); await expect(page.locator(".archive-result")).toHaveCount(0);
    } finally { await reader.close(); }
  });
  for (const destination of ["navigation", "refresh"] as const) {
    test(`${locale}: server snapshot rejects a delayed real body across ${destination}`, async ({ context, browser }) => {
      await signIn(context); const community = await space(context.request), text = archiveText[locale], marker = `delayedsnapshot${randomUUID()}`;
      await post(context.request, community, marker); const reader = await browser.newContext(); let page: Page | undefined;
      try {
        const readerId = await signIn(reader, false);
        expect((await write(reader.request, `/api/communities/${community}/memberships`, { action: "join" })).status()).toBe(200);
        expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "approve", userId: readerId })).status()).toBe(200);
        page = await reader.newPage(); await page.goto(`/${locale}/archive${destination === "navigation" ? `?community=${community}` : ""}`);
        if (destination === "refresh") await page.getByLabel(text.community, { exact: true }).selectOption(community);
        await holdArchiveBody(page); await page.getByLabel(text.query, { exact: true }).fill(marker); await page.getByRole("button", { name: text.submit, exact: true }).click();
        await page.waitForFunction(() => (window as unknown as SnapshotBrowser).archiveBodyHold?.reached);
        if (destination === "refresh") {
          expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "remove", userId: readerId })).status()).toBe(200);
          await refreshArchive(page);
        } else await page.getByRole("banner").getByRole("link", { name: text.title, exact: true }).click();
        await snapshotReset(page, locale); await page.getByLabel(text.query, { exact: true }).focus();
        await page.evaluate(() => (window as unknown as SnapshotBrowser).archiveBodyHold!.release());
        await page.waitForFunction(() => (window as unknown as SnapshotBrowser).archiveBodyHold?.delivered);
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        await snapshotReset(page, locale); await expect(page.getByLabel(text.query, { exact: true })).toBeFocused();
        await page.getByLabel(text.query, { exact: true }).fill(marker); const request = archiveRequest(page);
        await page.getByRole("button", { name: text.submit, exact: true }).click(); expect(new URL((await request).url()).searchParams.get("community")).toBeNull();
        if (destination === "refresh") await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
        else await expect(page.locator(".archive-result")).toHaveCount(1);
      } finally { if (page && !page.isClosed()) await page.evaluate(() => (window as unknown as SnapshotBrowser).archiveBodyHold?.release()); await reader.close(); }
    });
  }
  test(`${locale}: archive keyboard filters, bilingual cross-year results and deep reply destination at 320px`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request), text = archiveText[locale];
    const discussion = await post(context.request, community, "CE101 نقاش المؤشرات", "DISCUSSION", "مُـؤَشِّرَات شرح دراسي");
    const resource = await post(context.request, community, "CE101 مورد المؤشرات", "RESOURCE", "مُـؤَشِّرَات شرح دراسي");
    await fixture(client => client.query('UPDATE "Post" SET "createdAt"=$1 WHERE id=$2', ["2024-03-10T12:00:00Z", discussion]));
    const root = await write(context.request, `/api/communities/${community}/posts/${discussion}/comments`, { requestId: randomUUID(), body: "Original context" }); expect(root.status()).toBe(201);
    const reply = await write(context.request, `/api/communities/${community}/posts/${discussion}/comments`, { requestId: randomUUID(), replyToId: (await root.json()).id, body: "pipeline hazards explanation" }); expect(reply.status()).toBe(201); const replyId = (await reply.json()).id as string;
    await page.setViewportSize({ width: 320, height: 800 }); await page.goto(`/${locale}/archive?community=${community}`);
    await expect(page.getByRole("heading", { name: text.title, exact: true })).toBeVisible();
    await page.getByLabel(text.query, { exact: true }).fill("ce101 مؤشرات"); await page.getByLabel(text.query, { exact: true }).press("Enter");
    await expect(page.locator(".archive-result")).toHaveCount(2); await expect(page.locator(".archive-result").first().getByRole("link")).toHaveAttribute("href", new RegExp(resource));
    await expect(page.getByRole("heading", { name: text.results, exact: true })).toBeFocused();
    expect(await page.locator(".archive-result time").last().getAttribute("datetime")).toContain("2024");
    await page.getByLabel(postText[locale].type, { exact: true }).selectOption("RESOURCE"); await expect(page.locator(".archive-result")).toHaveCount(0);
    await page.getByRole("button", { name: text.submit, exact: true }).click(); await expect(page.locator(".archive-result")).toHaveCount(1);
    await page.getByLabel(postText[locale].type, { exact: true }).selectOption(""); await page.getByLabel(text.query, { exact: true }).fill("pipeline hazards");
    await page.getByRole("button", { name: text.submit, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByText(text.commentMatch, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await page.locator(".archive-result h3 a").click(); await expect(page.locator(`#comment-${replyId}`)).toBeFocused();
    await expect(page.locator(`#comment-${replyId}`)).toContainText("pipeline hazards explanation");
    await page.goto(`/${locale}/archive`); await page.getByLabel(text.query, { exact: true }).fill(`missing${randomUUID()}`); await page.getByRole("button", { name: text.submit, exact: true }).click();
    await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
  });
  test(`${locale}: archive failure retry, query-change cancellation and inert stored text`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request, "PUBLIC"), text = archiveText[locale], marker = `inert${randomUUID()}`;
    await post(context.request, community, `<img src=x onerror=alert(1)> ${marker}`, "DISCUSSION", "<script>window.archiveUnsafe=true</script>");
    await page.goto(`/${locale}/archive?community=${community}`);
    await page.route("**/api/archive?*", async route => { await route.fulfill({ status: 503, json: { ok: false } }); }, { times: 1 });
    await page.getByLabel(text.query, { exact: true }).fill(marker); await page.getByRole("button", { name: text.submit, exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.failed); await page.getByRole("button", { name: text.retry, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".archive-result")).toHaveCount(1); await expect(page.locator(".archive-result img, .archive-result script")).toHaveCount(0);
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(done => { release = done; }), seen = new Promise<void>(done => { started = done; });
    await page.route("**/api/archive?*", async route => {
      if (new URL(route.request().url()).searchParams.get("q") !== marker) return route.continue();
      const response = await route.fetch(); started(); await gate;
      // A changed query aborts this request. Only that transport cancellation is ignored.
      try { await route.fulfill({ response }); } catch (error) { if (!/closed|cancel|abort|invalid interception/i.test(String(error))) throw error; }
    });
    await page.getByRole("button", { name: text.submit, exact: true }).click(); await seen;
    await page.getByLabel(text.query, { exact: true }).fill(`absent${randomUUID()}`); await expect(page.locator(".archive-result")).toHaveCount(0);
    await page.getByRole("button", { name: text.submit, exact: true }).click(); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
    release(); await page.unrouteAll({ behavior: "wait" }); await expect(page.locator(".archive-result")).toHaveCount(0);
  });
}
test("archive: private pagination revocation, cross-user cursors and direct reply access stay server-authorized", async ({ context, browser, page }) => {
  const ownerId = await signIn(context), community = await space(context.request), marker = `private${randomUUID()}`;
  const ids = Array.from({ length: 23 }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',$4,\'Private synthetic excerpt\' FROM unnest($1::uuid[]) id', [ids, community, ownerId, marker]));
  const comment = await write(context.request, `/api/communities/${community}/posts/${ids[0]}/comments`, { requestId: randomUUID(), body: marker }); expect(comment.status()).toBe(201); const commentId = (await comment.json()).id as string;
  const reader = await browser.newContext();
  try {
    const readerId = await signIn(reader, false);
    const endpoint = `/api/archive?${new URLSearchParams({ q: marker, community })}`;
    expect((await reader.request.get(endpoint)).status()).toBe(404);
    expect((await (await reader.request.get(`/api/archive?q=${marker}`)).json()).items).toEqual([]);
    expect((await write(reader.request, `/api/communities/${community}/memberships`, { action: "join" })).status()).toBe(200);
    expect((await reader.request.get(endpoint)).status()).toBe(404);
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "approve", userId: readerId })).status()).toBe(200);
    const result = await reader.request.get(endpoint); expect(result.headers()["cache-control"]).toBe("private, no-store"); const first = await result.json(); expect(first.items).toHaveLength(20);
    expect((await context.request.get(`${endpoint}&after=${first.next}`)).status()).toBe(400);
    const second = await (await reader.request.get(`${endpoint}&after=${first.next}`)).json(); expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    const readerPage = await reader.newPage(); await readerPage.goto(`/en/archive?community=${community}`); await readerPage.getByLabel(archiveText.en.query, { exact: true }).fill(marker); await readerPage.getByRole("button", { name: archiveText.en.submit, exact: true }).click(); await expect(readerPage.locator(".archive-result")).toHaveCount(20);
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "remove", userId: readerId })).status()).toBe(200);
    await readerPage.getByRole("button", { name: archiveText.en.next, exact: true }).click(); await expect(readerPage.getByRole("main").getByRole("alert")).toHaveText(archiveText.en.unavailable); await expect(readerPage.locator(".archive-result")).toHaveCount(0);
    expect((await reader.request.get(`${endpoint}&after=${first.next}`)).status()).toBe(404);
    await readerPage.goto(`/en/communities/${community}/posts/${ids[0]}?comment=${commentId}`); await expect(readerPage.getByRole("main").getByRole("alert")).toHaveText(postText.en.unavailable);
    await page.goto(`/en/communities/${community}/posts/${ids[1]}?comment=${commentId}`); await expect(page.getByRole("main").getByRole("alert")).toHaveText(postText.en.unavailable);
  } finally { await reader.close(); }
});
test("archive API: bounded literal input, duplicate keys and disabled unsafe methods", async ({ context }) => {
  await signIn(context);
  for (const params of ["q=test&q=other", "q=test&membership=MEMBER", `q=${"x".repeat(201)}`, "q=%25", "q=test&type=INVALID"]) expect((await context.request.get(`/api/archive?${params}`)).status()).toBe(400);
  expect((await context.request.post("/api/archive", { data: { q: "test" } })).status()).toBe(405);
  expect((await context.request.get("/api/archive?q=literal%25_noMatch")).status()).toBe(200);
});
