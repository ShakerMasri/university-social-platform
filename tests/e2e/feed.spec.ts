import { expect, test, type BrowserContext, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { feedText } from "../../src/i18n/feed";
import { voteText } from "../../src/i18n/votes";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const write = (request: APIRequestContext, path: string, data: object) => request.post(path, { data, headers: { Origin: origin } });
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (process.env.M2_BROWSER_GROUP !== "feed" || !manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Guarded disposable feed browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic feed fixture failed; credentials omitted"); }
  finally { await client.end(); }
}
async function signIn(context: BrowserContext, profile = true) {
  const email = `feed.${randomUUID()}@university.test`;
  expect((await write(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await write(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (profile) expect((await write(context.request, "/api/identity/profile", { displayName: "دارس Feed" })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function setup(context: BrowserContext, owner: BrowserContext, count = 23) {
  const author = await signIn(owner), reader = await signIn(context, false);
  const spaces: string[] = [];
  for (const visibility of ["PUBLIC", "PRIVATE"]) {
    const response = await write(owner.request, "/api/communities", { name: `CE101 مجتمع ${visibility}`, description: "", visibility });
    expect(response.status()).toBe(201); const id = (await response.json()).id as string; spaces.push(id);
    expect((await write(context.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200);
    if (visibility === "PRIVATE") expect((await write(owner.request, `/api/communities/${id}/memberships`, { action: "approve", userId: reader })).status()).toBe(200);
  }
  const ids = Array.from({ length: count }, () => randomUUID());
  await fixture(async client => {
    for (let index = 0; index < ids.length; index++) await client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'QUESTION\',$4,$5,$6)',
      [ids[index], spaces[index % 2], author, `Feed ${index} سؤال`, "Original شرح <script>window.feedInjected=true</script>", new Date(Date.UTC(2026, 10, 17, 0, 0, count - index))]);
  });
  return { reader, spaces, ids };
}
async function keyboard(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await button.focus(); await page.keyboard.press("Enter");
}
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: empty profileless feed, bilingual membership stream, keyboard pages, original cards and retry`, async ({ context, browser, page }) => {
    const text = feedText[locale], owner = await browser.newContext();
    try {
      await signIn(context, false);
      await page.goto(`/${locale}/feed`); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
      // Use a new signed-in reader for the populated fixture; no account-data clearing.
      const { ids, spaces } = await setup(context, owner);
      await page.goto(`/${locale}/feed`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator(".post-card")).toHaveCount(20);
      expect(await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id))).toEqual(ids.slice(0, 20).map(id => `post-${id}`));
      await expect(page.getByRole("main").getByRole("link", { name: "CE101 مجتمع PRIVATE", exact: true }).first()).toHaveAttribute("href", `/${locale}/communities/${spaces[1]}`);
      expect(await page.evaluate(() => "feedInjected" in window)).toBe(false);
      const upvote = page.locator(".post-card").first().getByRole("button", { name: voteText[locale].add, exact: true });
      await page.locator("#feed-results").focus(); await page.keyboard.press("Tab");
      await expect(page.getByRole("main").getByRole("link", { name: "CE101 مجتمع PUBLIC", exact: true }).first()).toBeFocused();
      await page.keyboard.press("Tab"); await expect(upvote).toBeFocused();
      await page.keyboard.press("Enter"); await expect(upvote).toHaveAttribute("aria-pressed", "true");
      await page.route("**/api/feed?*", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
      await keyboard(page, text.next); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.failed);
      await expect(page.locator(".post-card")).toHaveCount(0); await expect(page.locator("#feed-results")).toBeFocused();
      await keyboard(page, text.retry); await expect(page.locator(".post-card")).toHaveCount(3);
      expect(await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id))).toEqual(ids.slice(20).map(id => `post-${id}`));
      await expect(page.getByText(text.end, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: text.next, exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator(".post-card").first().getByRole("link").last()).toHaveAttribute("href", `/${locale}/communities/${spaces[0]}/posts/${ids[20]}`);
    } finally { await owner.close(); }
  });
  test(`${locale}: revocation clears displayed cards, rejects stale cursors and refreshes membership-only content`, async ({ context, browser, page }) => {
    const text = feedText[locale], owner = await browser.newContext();
    try {
      const { reader, spaces } = await setup(context, owner);
      await page.goto(`/${locale}/feed`); await expect(page.locator(".post-card")).toHaveCount(20);
      expect((await write(owner.request, `/api/communities/${spaces[1]}/memberships`, { action: "remove", userId: reader })).status()).toBe(200);
      await keyboard(page, text.next); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.restart); await expect(page.locator(".post-card")).toHaveCount(0);
      await keyboard(page, text.refresh); await expect(page.locator(".post-card")).toHaveCount(12);
      await expect(page.getByRole("main").getByRole("link", { name: "CE101 مجتمع PRIVATE", exact: true })).toHaveCount(0);
      // Leaving PUBLIC removes it from this feed although ordinary public reads survive.
      expect((await write(context.request, `/api/communities/${spaces[0]}/memberships`, { action: "leave" })).status()).toBe(200);
      await keyboard(page, text.refresh); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
      expect((await context.request.get(`/api/communities/${spaces[0]}/posts`)).status()).toBe(200);
      expect((await context.request.get(`/api/communities/${spaces[1]}/posts`)).status()).toBe(404);
    } finally { await owner.close(); }
  });
}
test("feed API denies anonymous/foreign cursors, excludes public nonmembers, rejects malformed input and keeps no-store", async ({ context, browser }) => {
  expect((await context.request.get("/api/feed")).status()).toBe(401);
  const owner = await browser.newContext(), outsider = await browser.newContext();
  try {
    await setup(context, owner); await signIn(outsider, false);
    const response = await context.request.get("/api/feed"), first = await response.json();
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(first.items).toHaveLength(20);
    const empty = await outsider.request.get("/api/feed"); expect((await empty.json()).items).toEqual([]);
    expect([404, 409]).toContain((await outsider.request.get(`/api/feed?after=${first.next}`)).status());
    for (const query of ["after=bad", "after=&after=", "community=public", "q=study"]) expect((await context.request.get(`/api/feed?${query}`)).status()).toBe(400);
    expect((await context.request.post("/api/feed", { data: {} })).status()).toBe(405);
    expect((await write(context.request, "/api/identity/logout", {})).status()).toBe(200);
    expect((await context.request.get("/api/feed")).status()).toBe(401);
  } finally { await owner.close(); await outsider.close(); }
});
test("feed discards delayed parsed bodies after departure and account replacement", async ({ context, browser, page }) => {
  const owner = await browser.newContext();
  try {
    await setup(context, owner, 1);
    await page.goto("/en/feed"); await expect(page.locator(".post-card")).toHaveCount(1);
    await page.evaluate(() => {
      const target = window as typeof window & { releaseFeed?: () => void; feedHeld?: boolean }, fetchOriginal = window.fetch;
      let release!: () => void; const gate = new Promise<void>(done => { release = done; });
      target.releaseFeed = () => { window.fetch = fetchOriginal; release(); };
      window.fetch = async (...args) => {
        const response = await fetchOriginal(...args);
        if (String(args[0]).startsWith("/api/feed")) {
          const read = response.json.bind(response);
          response.json = async () => { const value: unknown = await read(); target.feedHeld = true; await gate; return value; };
        }
        return response;
      };
    });
    await keyboard(page, feedText.en.refresh);
    await expect.poll(() => page.evaluate(() => (window as typeof window & { feedHeld?: boolean }).feedHeld)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.evaluate(() => (window as typeof window & { releaseFeed?: () => void }).releaseFeed?.());
    await expect(page.getByText(feedText.en.paused, { exact: true })).toBeVisible(); await expect(page.locator(".post-card")).toHaveCount(0);
    await signIn(context, false);
    await keyboard(page, feedText.en.refresh); await expect(page.getByRole("main").getByRole("alert")).toHaveText(feedText.en.unavailable); await expect(page.locator(".post-card")).toHaveCount(0);
    await page.getByRole("link", { name: feedText.en.reopen, exact: true }).click(); await expect(page.getByText(feedText.en.empty, { exact: true })).toBeVisible();
  } finally { await owner.close(); }
});
