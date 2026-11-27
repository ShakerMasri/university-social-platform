import { chromium, expect, test, type BrowserContext, type APIRequestContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { feedText } from "../../src/i18n/feed";
import { identityText } from "../../src/i18n/identity";
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
test.beforeEach(async () => {
  // Advance only synthetic counters in the guarded disposable target. The
  // production sign-in/read limits remain enabled for each individual case.
  await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\''));
});
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

let forYouFixtureNumber = 0;
async function setupForYou(context: BrowserContext, owner: BrowserContext) {
  const existing = await setup(context, owner);
  const discovery = await write(owner.request, "/api/communities", { name: "Public discovery استكشاف", description: "", visibility: "PUBLIC" });
  expect(discovery.status()).toBe(201); const publicId = (await discovery.json()).id as string;
  const publicPosts = Array.from({ length: 23 }, () => randomUUID());
  const base = Date.UTC(2100, 0, 1 + ++forYouFixtureNumber * 30);
  await fixture(async client => {
    for (const [index, id] of existing.ids.entries()) await client.query('UPDATE "Post" SET "createdAt"=$1 WHERE id=$2', [new Date(base - index * 1000), id]);
    for (const [index, id] of publicPosts.entries()) await client.query('INSERT INTO "Post" (id,"communityId",type,title,body,"createdAt") VALUES ($1,$2,\'DISCUSSION\',$3,$4,$5)',
      [id, publicId, `Discovery ${index} شرح`, "CE101 public مؤشرات", new Date(base + 2 * 86400000 - index * 1000)]);
  });
  return { ...existing, publicPosts, publicId, base };
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: For You ranks both groups, explains recommendations, navigates feeds and preserves voting, focus and reflow`, async ({ context, browser, page }) => {
    const owner = await browser.newContext(), text = feedText[locale];
    try {
      const { ids, publicPosts, base } = await setupForYou(context, owner);
      await page.goto(`/${locale}/feed`);
      await page.getByRole("navigation", { name: text.navigation, exact: true }).getByRole("link", { name: text.forYou, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/feed/for-you`);
      await expect(page.locator(".post-card")).toHaveCount(20);
      expect(await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id))).toEqual(ids.slice(0, 20).map(id => `post-${id}`));
      await expect(page.getByText(text.joinedReason, { exact: true })).toHaveCount(20);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator(".post-card").first().locator("time")).toHaveAttribute("datetime", new Date(base).toISOString());
      const upvote = page.locator(".post-card").first().getByRole("button", { name: voteText[locale].add, exact: true });
      await page.locator("#feed-results").focus(); await page.keyboard.press("Tab");
      await expect(page.getByRole("main").getByRole("link", { name: "CE101 مجتمع PUBLIC", exact: true }).first()).toBeFocused();
      await page.keyboard.press("Tab"); await expect(upvote).toBeFocused(); await page.keyboard.press("Enter");
      await expect(upvote).toHaveAttribute("aria-pressed", "true");
      await page.route("**/api/feed/for-you?*", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
      await keyboard(page, text.next); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.failed);
      await expect(page.locator(".post-card")).toHaveCount(0); await expect(page.locator("#feed-results")).toBeFocused();
      await keyboard(page, text.retry); await expect(page.locator(".post-card")).toHaveCount(20);
      expect(await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id))).toEqual([...ids.slice(20), ...publicPosts.slice(0, 17)].map(id => `post-${id}`));
      await expect(page.getByText(text.publicReason, { exact: true })).toHaveCount(17);
      const publicCard = page.locator(`#post-${publicPosts[0]}`);
      await expect(publicCard.getByRole("button", { name: voteText[locale].add, exact: true })).toBeDisabled();
      await page.setViewportSize({ width: 320, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("navigation", { name: text.navigation, exact: true }).getByRole("link", { name: text.title, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/feed`); await expect(page.locator(".post-card")).toHaveCount(20);
    } finally { await owner.close(); }
  });
  test(`${locale}: For You cold-start, accessible empty/error/retry, access loss and account changes`, async ({ context, browser, page }) => {
    const owner = await browser.newContext(), text = feedText[locale];
    try {
      const { reader, spaces } = await setupForYou(context, owner);
      await page.goto(`/${locale}/feed/for-you`); await expect(page.locator(".post-card")).toHaveCount(20);
      expect((await write(owner.request, `/api/communities/${spaces[1]}/memberships`, { action: "remove", userId: reader })).status()).toBe(200);
      await keyboard(page, text.next); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.restart);
      await expect(page.locator(".post-card")).toHaveCount(0);
      expect((await write(context.request, `/api/communities/${spaces[0]}/memberships`, { action: "leave" })).status()).toBe(200);
      await keyboard(page, text.refresh); await expect(page.getByText(text.coldStart, { exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByRole("link", { name: text.archive, exact: true })).toHaveAttribute("href", `/${locale}/search?tab=posts`);
      await expect(page.getByRole("link", { name: text.discover, exact: true })).toBeVisible();
      const valid = await (await context.request.get("/api/feed/for-you")).json();
      await page.route("**/api/feed/for-you", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...valid, items: [], next: null }) }), { times: 1 });
      await keyboard(page, text.refresh); await expect(page.getByText(text.forYouEmpty, { exact: true })).toBeVisible();
      await page.route("**/api/feed/for-you", route => route.fulfill({ status: 403, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
      await keyboard(page, text.refresh); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.unavailable);
      await page.getByRole("link", { name: text.reopen, exact: true }).click(); await expect(page.locator(".post-card")).toHaveCount(20);
      await signIn(context, false); await keyboard(page, text.refresh);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.unavailable); await expect(page.locator(".post-card")).toHaveCount(0);
      await page.getByRole("link", { name: text.reopen, exact: true }).click(); await expect(page.getByText(text.coldStart, { exact: true })).toBeVisible();
      expect((await write(context.request, "/api/identity/logout", {})).status()).toBe(200);
      await keyboard(page, text.refresh); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.unavailable);
    } finally { await owner.close(); }
  });
}

test("For You API isolates feed cursors, validates input, preserves no-store and membership voting", async ({ context, browser }) => {
  expect((await context.request.get("/api/feed/for-you")).status()).toBe(401);
  const owner = await browser.newContext();
  try {
    await setupForYou(context, owner);
    const response = await context.request.get("/api/feed/for-you"), first = await response.json();
    expect(response.headers()["cache-control"]).toContain("private, no-store");
    expect((await context.request.get(`/api/feed?after=${first.next}`)).status()).toBe(409);
    const f01 = await (await context.request.get("/api/feed")).json();
    expect((await context.request.get(`/api/feed/for-you?after=${f01.next}`)).status()).toBe(409);
    for (const query of ["after=bad", "after=&after=", "q=study", "community=public"]) expect((await context.request.get(`/api/feed/for-you?${query}`)).status()).toBe(400);
    expect((await context.request.post("/api/feed/for-you", { data: {} })).status()).toBe(405);
    expect(JSON.stringify(first)).not.toMatch(/authorId|email|submissionKey|ownerId|rankTime/);
  } finally { await owner.close(); }
});

async function holdEmptyFeedSessionCheck(page: Page) {
  // Hold the authorization check for an empty feed. No old response is released.
  await page.evaluate(() => {
    const target = window as typeof window & { pendingFeedSessionSignal?: AbortSignal };
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (input !== "/api/feed/session" || !init?.signal) return original(input, init);
      window.fetch = original;
      const signal = init.signal;
      target.pendingFeedSessionSignal = signal;
      if (signal.aborted) throw signal.reason;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
  });
  const aborted = () => page.evaluate(() =>
    (window as typeof window & { pendingFeedSessionSignal?: AbortSignal }).pendingFeedSessionSignal?.aborted);
  await keyboard(page, feedText.en.refresh);
  await expect.poll(aborted).toBe(false);
  return aborted;
}

test("feed confirms the current session and responds to sign-in and sign-out in a separate tab", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/en/feed");
  await expect(page.getByText(feedText.en.empty, { exact: true })).toBeVisible();

  const response = await context.request.get("/api/feed");
  expect(response.status()).toBe(200);
  const { viewer } = await response.json();
  const headers = { "X-Feed-Expected-Viewer": viewer };
  expect((await context.request.get("/api/feed/session")).status()).toBe(400);
  expect((await context.request.get("/api/feed/session", {
    headers: { "X-Feed-Expected-Viewer": "invalid" },
  })).status()).toBe(400);
  const check = await context.request.get("/api/feed/session", { headers });
  expect(check.status()).toBe(200);
  expect(check.headers()["cache-control"]).toContain("no-store");
  expect(await check.json()).toEqual({ ok: true });

  const otherTab = await context.newPage();
  try {
    const email = `feed.${randomUUID()}@university.test`;
    expect((await write(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
    const token = await syntheticTokenFor(email);
    await otherTab.goto("/en/verify");
    try {
      const navigation = otherTab.waitForEvent("framenavigated", frame => frame === otherTab.mainFrame());
      await otherTab.evaluate(token => window.location.replace(`/en/verify#${token}`), token);
      await navigation;
      await otherTab.waitForFunction(() => window.location.hash === "");
    } catch { throw new Error("Synthetic link navigation failed; credentials omitted"); }
    const signInAborted = await holdEmptyFeedSessionCheck(page);
    await otherTab.getByRole("button", { name: identityText.en.confirm, exact: true }).click();
    // First sign-in opens the display-name step (UI rebuild Stage 1).
    await expect(otherTab).toHaveURL(/\/en\/profile\?welcome=1$/);
    await expect(page.getByText(feedText.en.unavailable, { exact: true })).toBeVisible();
    await expect.poll(signInAborted).toBe(true);
    expect((await context.request.get("/api/feed/session", { headers })).status()).toBe(403);

    await page.getByRole("link", { name: feedText.en.reopen, exact: true }).click();
    await expect(page.getByText(feedText.en.empty, { exact: true })).toBeVisible();
    await otherTab.goto("/en/profile");
    const signOutAborted = await holdEmptyFeedSessionCheck(page);
    await otherTab.getByRole("button", { name: identityText.en.logout, exact: true }).click();
    await expect(otherTab).toHaveURL(/\/en\/signin$/);
    await expect(page.getByText(feedText.en.unavailable, { exact: true })).toBeVisible();
    await expect.poll(signOutAborted).toBe(true);
    expect((await context.request.get("/api/feed/session", { headers })).status()).toBe(401);
  } finally { await otherTab.close(); }
});

for (const path of ["feed", "feed/for-you"]) {
  test(`${path}: a failed session check withholds authorized synthetic private cards`, async ({ context, browser, page }) => {
    const owner = await browser.newContext();
    try {
      const forYou = path === "feed/for-you";
      const { ids } = forYou ? await setupForYou(context, owner) : await setup(context, owner, 2);
      const privateCard = page.locator(`#post-${ids[1]}`);
      const sessionUrl = "**/api/feed/session";
      await page.route(sessionUrl, route => route.fulfill({ status: 503 }));
      const feedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/${path}`);
      await page.goto(`/en/${path}`);
      const response = await feedResponse;
      expect(response.status()).toBe(200);
      const { items } = await response.json() as { items: { id: string }[] };
      expect(items.some(item => item.id === ids[1])).toBe(true);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(feedText.en.failed);
      await expect(privateCard).toHaveCount(0);

      await page.unroute(sessionUrl);
      await keyboard(page, feedText.en.retry);
      await expect(privateCard).toBeVisible();
      if (forYou) {
        const visibilityCheck = page.waitForResponse(response => new URL(response.url()).pathname === "/api/feed/session");
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        expect((await visibilityCheck).status()).toBe(200);
      }
      await page.route(sessionUrl, route => route.fulfill({ status: 403 }));
      await page.evaluate((forYou) => {
        if (forYou) window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
        else window.dispatchEvent(new Event("focus"));
      }, forYou);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(feedText.en.unavailable);
      await expect(privateCard).toHaveCount(0);
    } finally { await owner.close(); }
  });
}

test("For You discards a pending private response after switching to another viewer in the same document", async ({ context, browser, page }) => {
  const owner = await browser.newContext();
  try {
    const { ids } = await setupForYou(context, owner);
    const privateCardId = `post-${ids[1]}`;
    await page.goto("/en/feed/for-you");
    await expect(page.locator(`#${privateCardId}`)).toBeVisible();
    const previousResponse = await context.request.get("/api/feed/for-you");
    expect(previousResponse.status()).toBe(200);
    const previous = await previousResponse.json();
    await page.evaluate((privateCardId) => {
      const original = window.fetch;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const race = {
        held: false,
        resolved: false,
        release,
        resurfaced: false,
      };
      Object.assign(window, { feedAccountRace: race });
      const selector = `#${privateCardId}`;
      const observer = new MutationObserver(records => {
        if (records.some(record => Array.from(record.addedNodes).some(node =>
          node instanceof Element && (node.matches(selector) || node.querySelector(selector))))) race.resurfaced = true;
      });
      observer.observe(document.body, { subtree: true, childList: true });
      window.fetch = async (...args) => {
        if (!String(args[0]).startsWith("/api/feed/for-you")) return original(...args);
        window.fetch = original;
        const response = await original(...args);
        const read = response.json.bind(response);
        response.json = async () => {
          const payload: { items: { id: string }[] } = await read();
          race.held = payload.items.some(row => `post-${row.id}` === privateCardId);
          await gate;
          race.resolved = true;
          return payload;
        };
        return response;
      };
    }, privateCardId);
    const readRace = () => page.evaluate(() => {
      const race = (window as typeof window & { feedAccountRace?: { held: boolean; resolved: boolean; resurfaced: boolean } }).feedAccountRace;
      return race && { held: race.held, resolved: race.resolved, resurfaced: race.resurfaced };
    });
    await keyboard(page, feedText.en.refresh);
    await expect.poll(readRace).toEqual({ held: true, resolved: false, resurfaced: false });
    await expect(page.locator(`#${privateCardId}`)).toHaveCount(0);

    await signIn(context, false);
    const replacementResponse = await context.request.get("/api/feed/for-you");
    expect(replacementResponse.status()).toBe(200);
    const replacement = await replacementResponse.json();
    expect(replacement.viewer).not.toBe(previous.viewer);
    expect(replacement.coldStart).toBe(true);
    const feeds = page.getByRole("navigation", { name: feedText.en.navigation, exact: true });
    await feeds.getByRole("link", { name: feedText.en.title, exact: true }).click();
    await expect(page.getByText(feedText.en.empty, { exact: true })).toBeVisible();
    await feeds.getByRole("link", { name: feedText.en.forYou, exact: true }).click();
    await expect(page.getByText(feedText.en.coldStart, { exact: true })).toBeVisible();
    const visible = await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id));
    expect(visible).toHaveLength(20);

    // The old JSON resolves even though its fetch was aborted during unmount.
    // A page reload would lose this gate and fail the test.
    await page.evaluate(async () => {
      const race = (window as typeof window & { feedAccountRace?: { release: () => void } }).feedAccountRace;
      if (!race) throw new Error("Account switch replaced the document");
      race.release();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect(page.locator(`#${privateCardId}`)).toHaveCount(0);
    expect(await readRace()).toEqual({ held: true, resolved: true, resurfaced: false });
    expect(await page.locator(".post-card").evaluateAll(cards => cards.map(card => card.id))).toEqual(visible);
  } finally { await owner.close(); }
});

test("For You suppresses delayed parsed responses on navigation and departure", async ({ context, browser, page }) => {
  const owner = await browser.newContext();
  try {
    await setupForYou(context, owner); await page.goto("/en/feed/for-you"); await expect(page.locator(".post-card")).toHaveCount(20);
    const holdParsed = () => page.evaluate(() => {
      const target = window as typeof window & { releaseForYou?: () => void; forYouHeld?: boolean }, original = window.fetch;
      target.forYouHeld = false;
      let release!: () => void; const gate = new Promise<void>(done => { release = done; });
      target.releaseForYou = () => { window.fetch = original; release(); };
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).startsWith("/api/feed/for-you")) {
          const read = response.json.bind(response);
          response.json = async () => { const result: unknown = await read(); target.forYouHeld = true; await gate; return result; };
        }
        return response;
      };
    });
    await holdParsed();
    await keyboard(page, feedText.en.refresh);
    await expect.poll(() => page.evaluate(() => (window as typeof window & { forYouHeld?: boolean }).forYouHeld)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.evaluate(() => (window as typeof window & { releaseForYou?: () => void }).releaseForYou?.());
    await expect(page.getByText(feedText.en.paused, { exact: true })).toBeVisible(); await expect(page.locator(".post-card")).toHaveCount(0);
    await holdParsed(); await keyboard(page, feedText.en.refresh);
    await expect.poll(() => page.evaluate(() => (window as typeof window & { forYouHeld?: boolean }).forYouHeld)).toBe(true);
    await page.getByRole("navigation", { name: feedText.en.navigation, exact: true }).getByRole("link", { name: feedText.en.title, exact: true }).click();
    await page.evaluate(() => (window as typeof window & { releaseForYou?: () => void }).releaseForYou?.());
    await expect(page).toHaveURL("/en/feed"); await expect(page.locator(".post-card")).toHaveCount(20);
    await expect(page.getByText(feedText.en.joinedReason, { exact: true })).toHaveCount(0);
    await expect(page.getByText(feedText.en.publicReason, { exact: true })).toHaveCount(0);
  } finally { await owner.close(); }
});

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: For You native browser zoom at 200% and 400%`, async () => {
    test.setTimeout(60_000);
    const extension = resolve("tests/e2e/fixtures/page-zoom");
    const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined,
      baseURL: origin, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1296,900"] });
    try {
      await signIn(context, false);
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const page = context.pages()[0] ?? await context.newPage(); await page.goto(`/${locale}/feed/for-you`);
      const session = await context.newCDPSession(page);
      try {
        const { windowId } = await session.send("Browser.getWindowForTarget");
        await session.send("Browser.setContentsSize", { windowId, width: 1280 });
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
      } finally { await session.detach(); }
      const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
      for (const factor of [2, 4]) {
        const actual = await worker.evaluate(async factor => {
          const api = (globalThis as unknown as { chrome: { tabs: {
            query(input: { active: boolean; currentWindow: boolean }): Promise<{ id: number }[]>;
            setZoomSettings(id: number, value: { mode: "automatic"; scope: "per-origin" }): Promise<void>;
            setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number>;
          } } }).chrome;
          const [tab] = await api.tabs.query({ active: true, currentWindow: true });
          await api.tabs.setZoomSettings(tab.id, { mode: "automatic", scope: "per-origin" });
          await api.tabs.setZoom(tab.id, factor); return api.tabs.getZoom(tab.id);
        }, factor);
        expect(actual).toBeCloseTo(factor, 12);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBeCloseTo(baseline.width / factor, 0);
        expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(baseline.dpr * factor, 6);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await keyboard(page, feedText[locale].refresh); await expect(page.locator("#feed-results")).toBeFocused();
      }
    } finally { await context.close(); }
  });
}
