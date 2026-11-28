import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import { feedText } from "../../src/i18n/feed";
import type { SessionOutcome } from "./fixture";

const origin = "http://feed-component.invalid";
const sessionPath = "/api/feed/session";
const text = feedText.en;
let script: string;

test.beforeAll(async () => {
  // Bundle the real client component without starting Next.js or connecting to identity infrastructure.
  const result = await build({
    configFile: false, envDir: false, publicDir: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    resolve: { alias: {
      "@": resolve("src"),
      "next/link": resolve("tests/feed-component/navigation.tsx"),
      "next/navigation": resolve("tests/feed-component/navigation.tsx"),
    } },
    build: {
      write: false, minify: false,
      lib: { entry: resolve("tests/feed-component/fixture.tsx"), formats: ["iife"], name: "FeedComponent" },
    },
  });
  const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => "output" in bundle ? bundle.output : []);
  // The list's CSS modules come out as one stylesheet asset. Behaviour does not
  // depend on it, so only the script is served; anything else is unexpected.
  const chunks = files.filter(file => file.type === "chunk");
  const others = files.filter(file => file.type !== "chunk");
  if (chunks.length !== 1 || others.some(file => !file.fileName.endsWith(".css"))) throw new Error("Expected one fixture script");
  script = chunks[0].code;
});

async function open(page: Page, path: string) {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.addInitScript(() => {
    // React's development build uses Node's environment object to enable Strict Mode replay.
    Object.assign(globalThis, { process: { env: { NODE_ENV: "development" } } });
  });
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1_000);
  const language = path.startsWith("/ar/") ? 'lang="ar" dir="rtl"' : 'lang="en" dir="ltr"';
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === path.split("?")[0]) return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html ${language}><meta charset="utf-8"><link rel="icon" href="data:,"><div id="fixture"></div><script src="/fixture.js"></script></html>`,
    });
    return route.abort();
  });
  await page.goto(origin + path);
  expect(await page.evaluate(() => Boolean(window.feedFixture))).toBe(true);
  await page.clock.runFor(0);
  expect(browserErrors).toEqual([]);
  expect((await inspect(page)).requests.length).toBeGreaterThan(0);
}

const sentinel = (page: Page) => page.getByRole("heading", { name: "Synthetic feed sentinel" });
const inspect = (page: Page) => page.evaluate(() => window.feedFixture.inspect());
const checkOutcome = (page: Page, outcome: SessionOutcome) =>
  page.evaluate(outcome => window.feedFixture.setOutcome(outcome), outcome);
const countChecks = async (page: Page) => (await inspect(page)).requests.filter(request => request.path === sessionPath).length;
const finishHeldCheck = (page: Page, index: number) =>
  page.evaluate(index => window.feedFixture.release(index), index);
// An alert holds the message as its heading, plus its action (Retry, Reopen).
const alert = (page: Page, message: string) => expect(page.getByRole("alert").getByRole("heading")).toHaveText(message);
const activate = (page: Page, name: string) => page.getByRole("button", { name, exact: true })
  .evaluate(button => (button as HTMLButtonElement).click());

for (const path of ["/en/feed", "/en/feed/for-you"]) {
  const apiPath = "/api" + path.slice(3);
  const emptyText = path.endsWith("/for-you") ? text.forYouEmpty : text.empty;
  test.describe(path, () => {
    test("renders once and renews at 25 seconds without replacing cards or moving focus", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      const refresh = page.getByRole("button", { name: text.refresh });
      await refresh.focus();
      await page.clock.runFor(24_999);
      expect((await inspect(page)).requests.map(request => request.path)).toEqual([apiPath, sessionPath]);
      await page.clock.runFor(1);
      expect(await countChecks(page)).toBe(2);
      await page.clock.runFor(25_000);
      const result = await inspect(page);
      expect(result.requests.map(request => request.path)).toEqual([apiPath, sessionPath, sessionPath, sessionPath]);
      for (const request of result.requests.slice(1)) {
        expect(request).toMatchObject({ viewer: "a".repeat(64), cache: "no-store", aborted: false });
      }
      expect(result).toMatchObject({ added: 1, removed: 0 });
      expect(result.lifecycle).toEqual(["mount", "cleanup", "mount"]);
      await expect(refresh).toBeFocused();
      await expect(sentinel(page)).toBeVisible();
    });

    for (const outcome of [401, 403, 503, 429, "malformed", "offline"] as const) {
      test(`clears on ${outcome} and stops polling`, async ({ page }) => {
        await open(page, path);
        await expect(sentinel(page)).toBeVisible();
        await checkOutcome(page, outcome);
        await page.clock.runFor(25_000);
        await alert(page, outcome === 401 || outcome === 403 ? text.unavailable : text.failed);
        await expect(sentinel(page)).toHaveCount(0);
        await page.clock.runFor(60_000);
        expect(await countChecks(page)).toBe(2);
        expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
        if (outcome === 503) {
          await checkOutcome(page, 200);
          await activate(page, text.retry);
          await expect(sentinel(page)).toBeVisible();
          await page.clock.runFor(25_000);
          expect(await countChecks(page)).toBe(4);
        }
      });
    }

    test("expires a permanently pending check at the absolute deadline", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await page.clock.runFor(29_999);
      expect(await countChecks(page)).toBe(2);
      await expect(sentinel(page)).toBeVisible();
      await page.clock.runFor(1);
      await alert(page, text.failed);
      expect((await inspect(page)).requests[2].aborted).toBe(true);
      await page.clock.runFor(60_000);
      expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
      expect(await countChecks(page)).toBe(2);
    });

    test("rejects success after elapsed expiry even before the timeout callback", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await page.clock.runFor(25_000);
      await page.evaluate(() => window.feedFixture.delayCallbacksBy(5_001));
      await finishHeldCheck(page, 2);
      await alert(page, text.failed);
      await page.clock.runFor(30_000);
      expect(await countChecks(page)).toBe(2);
      expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
    });

    test("a timer waking after expiry clears cards without making a late check", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await page.evaluate(() => window.feedFixture.delayCallbacksBy(6_000));
      await page.clock.runFor(25_000);
      await alert(page, text.failed);
      expect(await countChecks(page)).toBe(1);
      expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
    });

    test("starts freshness at request start and caps a late focus check at expiry", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await activate(page, text.refresh);
      await expect.poll(() => countChecks(page)).toBe(2);
      await page.clock.runFor(4_000);
      await finishHeldCheck(page, 3);
      await expect(sentinel(page)).toBeVisible();
      // Move the app clock without firing the due timer, then deliver a focus event.
      await page.evaluate(() => {
        window.feedFixture.delayCallbacksBy(24_000);
        window.dispatchEvent(new Event("focus"));
      });
      expect(await countChecks(page)).toBe(3);
      await page.clock.runFor(1_999);
      await expect(sentinel(page)).toBeVisible();
      await page.clock.runFor(1);
      await alert(page, text.failed);
      expect(await inspect(page)).toMatchObject({ added: 2, removed: 2 });
    });

    test("delayed periodic success anchors the next renewal and expiry to request start", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await page.clock.runFor(25_000);
      expect(await countChecks(page)).toBe(2);
      await page.clock.runFor(4_000);
      await finishHeldCheck(page, 2);
      await expect(sentinel(page)).toBeVisible();
      // The successful renewal began at 25s and completed at 29s. The next
      // check is due at 50s. Deliver that timer three seconds late to prove
      // the pending check gets only two seconds of the renewed 55s deadline,
      // rather than five seconds or a deadline anchored to completion at 29s.
      await page.clock.runFor(20_999);
      expect(await countChecks(page)).toBe(2);
      await page.evaluate(() => window.feedFixture.delayCallbacksBy(3_000));
      await page.clock.runFor(1);
      expect(await countChecks(page)).toBe(3);
      await page.clock.runFor(1_999);
      await expect(sentinel(page)).toBeVisible();
      await page.clock.runFor(1);
      await alert(page, text.failed);
      await expect(sentinel(page)).toHaveCount(0);
      expect((await inspect(page)).requests[3].aborted).toBe(true);
      await finishHeldCheck(page, 3);
      await page.clock.runFor(0);
      await alert(page, text.failed);
      expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
    });

    for (const locale of ["en", "ar"] as const) {
      test(`keeps keyboard focus at the feed results when invalidation removes the focused card (${locale})`, async ({ page }) => {
        const localized = feedText[locale];
        const localizedPath = `/${locale}${path.slice(3)}`;
        const forYouPath = path.endsWith("/for-you");
        // "Reopen" goes to the matching Home tab (the feed is Home now).
        const homePath = forYouPath ? `/${locale}?tab=for-you` : `/${locale}`;
        await open(page, localizedPath);
        await expect(sentinel(page)).toBeVisible();
        const heading = page.getByRole("heading", { name: forYouPath ? localized.forYouResults : localized.results, exact: true });
        const cardControl = page.getByRole("article").first().getByRole("heading").getByRole("link");
        async function tabToCardControl() {
          await heading.focus();
          await page.keyboard.press("Tab"); // Refresh, in the heading row
          await page.keyboard.press("Tab"); // The card's community link
          await page.keyboard.press("Tab"); // The card's title link
          await expect(cardControl).toBeFocused();
        }

        await expect(heading).toHaveAttribute("tabindex", "-1");
        await tabToCardControl();
        await page.clock.runFor(25_000);
        expect(await countChecks(page)).toBe(2);
        await expect(cardControl).toBeFocused();

        await checkOutcome(page, 503);
        await page.clock.runFor(25_000);
        await alert(page, localized.failed);
        await expect(sentinel(page)).toHaveCount(0);
        await expect(heading).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: localized.retry, exact: true })).toBeFocused();
        await checkOutcome(page, 200);
        await page.keyboard.press("Enter");
        await expect(sentinel(page)).toBeVisible();
        await expect(heading).toBeFocused();

        await tabToCardControl();
        await page.evaluate(() => window.feedFixture.broadcast());
        await alert(page, localized.unavailable);
        await expect(sentinel(page)).toHaveCount(0);
        await expect(heading).toBeFocused();
        const reopen = page.getByRole("link", { name: localized.reopen, exact: true });
        await expect(reopen).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(reopen).toBeFocused();
        await expect(reopen).toHaveAttribute("href", homePath);
      });
    }

    for (const pendingPhase of ["foreground", "background"] as const) {
      test(`broadcast invalidates a pending ${pendingPhase} verification`, async ({ page }) => {
        await open(page, path);
        await expect(sentinel(page)).toBeVisible();
        await checkOutcome(page, "pending");
        if (pendingPhase === "foreground") await activate(page, text.refresh);
        else await page.clock.runFor(25_000);
        await expect.poll(() => countChecks(page)).toBe(2);
        const discover = page.getByRole("link", { name: text.discover, exact: true });
        await discover.focus();
        await page.evaluate(() => window.feedFixture.broadcast());
        await alert(page, text.unavailable);
        await expect(discover).toBeFocused();
        const heldIndex = pendingPhase === "foreground" ? 3 : 2;
        expect((await inspect(page)).requests[heldIndex].aborted).toBe(true);
        await finishHeldCheck(page, heldIndex);
        await page.clock.runFor(0);
        await alert(page, text.unavailable);
        await expect(page.getByRole("link", { name: text.reopen, exact: true })).toBeVisible();
        await expect(discover).toBeFocused();
        await expect(sentinel(page)).toHaveCount(0);
        await page.clock.runFor(60_000);
        await alert(page, text.unavailable);
        await expect(page.getByRole("link", { name: text.reopen, exact: true })).toBeVisible();
        await expect(discover).toBeFocused();
        await expect(sentinel(page)).toHaveCount(0);
        expect(await countChecks(page)).toBe(2);
        expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
      });
    }

    test("coalesces timer, focus and visibility; Next supersedes the pending check", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await page.clock.runFor(25_000);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(await countChecks(page)).toBe(2);
      await checkOutcome(page, 200);
      await activate(page, text.next);
      await expect(sentinel(page)).toBeVisible();
      await expect.poll(() => countChecks(page)).toBe(3);
      expect((await inspect(page)).requests[2].aborted).toBe(true);
      await finishHeldCheck(page, 2);
      await page.clock.runFor(25_000);
      expect(await countChecks(page)).toBe(4);
      expect((await inspect(page)).requests.filter(request => request.path.startsWith(apiPath + "?after="))).toHaveLength(1);
      expect(await inspect(page)).toMatchObject({ added: 2, removed: 1 });
    });

    test("stops when hidden and keeps cards cleared through visibility and history restoration", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await page.evaluate(() => window.feedFixture.visibility("hidden"));
      await expect(sentinel(page)).toHaveCount(0);
      await page.clock.runFor(60_000);
      expect(await countChecks(page)).toBe(1);
      await page.evaluate(() => {
        window.feedFixture.visibility("visible");
        window.dispatchEvent(new Event("focus"));
      });
      await page.clock.runFor(0);
      expect(await countChecks(page)).toBe(2);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await page.clock.runFor(60_000);
      expect(await countChecks(page)).toBe(3);
      expect(await inspect(page)).toMatchObject({ added: 1, removed: 1 });
      await expect(page.getByText(text.paused)).toBeVisible();
      await activate(page, text.refresh);
      await expect(sentinel(page)).toBeVisible();
    });

    test("switching feed or viewer disposes old work, and unmount stops all checks", async ({ page }) => {
      await open(page, path);
      await expect(sentinel(page)).toBeVisible();
      await checkOutcome(page, "pending");
      await page.clock.runFor(25_000);
      expect(await countChecks(page)).toBe(2);
      await checkOutcome(page, 200);
      await page.evaluate(() => window.feedFixture.switchFeed());
      await expect.poll(() => countChecks(page)).toBe(3);
      expect((await inspect(page)).requests[2].aborted).toBe(true);
      await finishHeldCheck(page, 2);
      await page.evaluate(() => window.feedFixture.changeViewer());
      await expect.poll(() => countChecks(page)).toBe(4);
      expect((await inspect(page)).requests.at(-1)?.viewer).toBe("b".repeat(64));
      await expect(sentinel(page)).toBeVisible();
      await page.evaluate(() => window.feedFixture.unmount());
      await page.clock.runFor(60_000);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      expect(await countChecks(page)).toBe(4);
      expect(await inspect(page)).toMatchObject({ added: 3, removed: 3 });
    });

    test("empty feed stays idle and foreground load retains its 15-second deadline", async ({ page }) => {
      await open(page, path + "?empty");
      await expect(page.getByText(emptyText)).toBeVisible();
      await page.clock.runFor(60_000);
      expect(await countChecks(page)).toBe(1);
      await page.evaluate(() => {
        window.feedFixture.setEmpty(false);
        window.feedFixture.setOutcome("pending");
      });
      await activate(page, text.refresh);
      await expect.poll(() => countChecks(page)).toBe(2);
      await page.clock.runFor(14_999);
      await expect(page.getByText(text.loading)).toBeVisible();
      await page.clock.runFor(1);
      await alert(page, text.failed);
      expect((await inspect(page)).requests[3].aborted).toBe(true);
      await finishHeldCheck(page, 3);
      expect(await inspect(page)).toMatchObject({ added: 0, removed: 0 });
      await checkOutcome(page, 200);
      await activate(page, text.retry);
      await expect(sentinel(page)).toBeVisible();
    });
  });
}
