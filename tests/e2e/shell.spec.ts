import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { shellText } from "../../src/i18n/shell";
import { dictionaries } from "../../src/i18n/dictionaries";
import { uiText } from "../../src/i18n/ui";
import { identityText } from "../../src/i18n/identity";
import { sessionCookie } from "../../src/server/identity/policy";
import { notificationText } from "../../src/i18n/notifications";
import { avatarInitials } from "../../src/ui/avatar-initials";
import { openNotificationsFromShell, openProfileFromShell } from "./shell-navigation";

// UI rebuild Stage 1: the app shell (header, navigation, mobile bar,
// notifications preview, account menu) and the localized 404 pages.
// Synthetic accounts only; traces, videos and automatic screenshots stay off.
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const locales = ["en", "ar"] as const;

async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable shell browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic shell fixture failed; private diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });

const write = (context: BrowserContext, path: string, data: object) => context.request.post(path, { data, headers: { Origin: origin } });
async function signIn(context: BrowserContext, displayName: string | null = "Synthetic طالب") {
  const email = `shell.${randomUUID()}@university.test`;
  expect((await write(context, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await write(context, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (displayName) expect((await write(context, "/api/identity/profile", { displayName })).status()).toBe(200);
  return email;
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
/** A comment notification for `owner`, created through the real APIs. */
async function commentNotification(owner: BrowserContext, other: BrowserContext, title: string) {
  const community = await write(owner, "/api/communities", { name: `Shell ${randomUUID()}`, description: "", visibility: "PUBLIC" });
  expect(community.status()).toBe(201); const communityId = (await community.json()).id as string;
  const post = await write(owner, `/api/communities/${communityId}/posts`, { requestId: randomUUID(), type: "QUESTION", title, body: "Synthetic question" });
  expect(post.status()).toBe(201); const postId = (await post.json()).id as string;
  expect((await write(other, `/api/communities/${communityId}/memberships`, { action: "join" })).status()).toBe(200);
  expect((await write(other, `/api/communities/${communityId}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Synthetic answer" })).status()).toBe(201);
  return { communityId, postId };
}

for (const locale of locales) {
  const text = shellText[locale];

  test(`${locale}: skip link, landmarks and keyboard order in the signed-in shell`, async ({ context, page }) => {
    await signIn(context);
    await page.goto(`/${locale}/communities`);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: dictionaries[locale].skipToContent });
    await expect(skip).toBeFocused(); await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("search")).toBeVisible();
    const nav = page.getByRole("navigation", { name: text.navigation, exact: true });
    await expect(nav.getByRole("link", { name: text.communities, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: text.home, exact: true })).not.toHaveAttribute("aria-current");
    await expect(page.getByRole("navigation", { name: text.mobileNavigation, exact: true })).toBeHidden();
    // The header search field is reachable and labelled.
    await expect(page.getByRole("searchbox", { name: text.searchLabel, exact: true })).toBeVisible();
  });

  test(`${locale}: account menu opens from the keyboard, returns focus and signs out`, async ({ context, page }) => {
    await signIn(context);
    await page.goto(`/${locale}/communities`);
    const trigger = page.getByRole("button", { name: text.account, exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: text.account, exact: true });
    await expect(menu.getByRole("menuitem", { name: text.profileSettings, exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden(); await expect(trigger).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: text.profileSettings, exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: text.signOut, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/signin`);
    await expect(page.getByLabel(identityText[locale].email, { exact: true })).toBeVisible();
    expect((await context.cookies()).some(cookie => cookie.name === sessionCookie)).toBe(false);
  });

  test(`${locale}: header sign-out failure keeps the session and says so`, async ({ context, page }) => {
    await signIn(context);
    await page.goto(`/${locale}/communities`);
    await page.route("**/api/identity/logout", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
    await page.getByRole("button", { name: text.account, exact: true }).click();
    await page.getByRole("menuitem", { name: text.signOut, exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: text.signOutFailed })).toBeVisible();
    await expect(page).toHaveURL(`${origin}/${locale}/communities`);
    expect((await context.cookies()).some(cookie => cookie.name === sessionCookie)).toBe(true);
  });

  test(`${locale}: notifications preview shows the unread count, opens an item and closes with Escape`, async ({ context, page, browser }) => {
    await signIn(context);
    const other = await browser.newContext({ baseURL: origin });
    try {
      await signIn(other, "Synthetic مجيب");
      const title = `Shell notification ${randomUUID().slice(0, 8)}`;
      const { communityId, postId } = await commentNotification(context, other, title);
      await page.goto(`/${locale}/communities`);
      const bell = page.getByRole("button", { name: text.notificationsUnread.replace("{count}", (1).toLocaleString(locale)), exact: true });
      await expect(bell).toHaveAttribute("aria-expanded", "false");
      await bell.focus(); await page.keyboard.press("Enter");
      await expect(bell).toHaveAttribute("aria-expanded", "true");
      const preview = page.getByRole("region", { name: text.notificationsPreview, exact: true });
      const item = preview.getByRole("button").filter({ hasText: title });
      await expect(item).toBeVisible();
      await expect(preview.getByRole("link", { name: text.notificationsSeeAll, exact: true })).toHaveAttribute("href", `/${locale}/notifications`);
      await page.keyboard.press("Tab");
      await expect(item).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(preview).toBeHidden(); await expect(bell).toBeFocused();
      await bell.click(); await item.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/communities/${communityId}/posts/${postId}\\?notification=`));
      // Opening marked it read; the next server render has no unread count.
      await page.reload();
      await expect(page.getByRole("button", { name: uiText[locale].notifications, exact: true })).toBeVisible();
    } finally { await other.close(); }
  });

  test(`${locale}: the unread count follows access: removal drops it on the next render, rejoining restores it`, async ({ context, page, browser }) => {
    const owner = await browser.newContext({ baseURL: origin });
    try {
      const memberEmail = await signIn(context); await signIn(owner, "Synthetic مالك");
      const memberId = await fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [memberEmail])).rows[0].id);
      const created = await write(owner, "/api/communities", { name: `Count ${randomUUID()}`, description: "", visibility: "PRIVATE" });
      expect(created.status()).toBe(201); const communityId = (await created.json()).id as string;
      expect((await write(context, `/api/communities/${communityId}/memberships`, { action: "join" })).status()).toBe(200);
      expect((await write(owner, `/api/communities/${communityId}/memberships`, { action: "approve", userId: memberId })).status()).toBe(200);
      const title = `Count announcement ${randomUUID().slice(0, 8)}`;
      expect((await write(owner, `/api/communities/${communityId}/posts`, { requestId: randomUUID(), type: "ANNOUNCEMENT", title, body: "Synthetic" })).status()).toBe(201);
      const unreadBell = page.getByRole("banner").getByRole("button", { name: text.notificationsUnread.replace("{count}", (1).toLocaleString(locale)), exact: true });
      const quietBell = page.getByRole("banner").getByRole("button", { name: uiText[locale].notifications, exact: true });
      await page.goto(`/${locale}/communities`);
      await expect(unreadBell).toBeVisible();
      // Removed from the private community: its notification no longer counts or shows.
      expect((await write(owner, `/api/communities/${communityId}/memberships`, { action: "remove", userId: memberId })).status()).toBe(200);
      await page.reload();
      await expect(quietBell).toBeVisible(); await expect(unreadBell).toHaveCount(0);
      await quietBell.click();
      await expect(page.getByRole("region", { name: text.notificationsPreview, exact: true })).toContainText(text.notificationsEmpty);
      await expect(page.getByText(title)).toHaveCount(0);
      // Readmitted: the same unread record counts again.
      expect((await write(context, `/api/communities/${communityId}/memberships`, { action: "join" })).status()).toBe(200);
      expect((await write(owner, `/api/communities/${communityId}/memberships`, { action: "approve", userId: memberId })).status()).toBe(200);
      await page.reload();
      await expect(unreadBell).toBeVisible();
    } finally { await owner.close(); }
  });

  test(`${locale}: the header follows changes made on a page without a reload`, async ({ context, page, browser }) => {
    await signIn(context);
    const other = await browser.newContext({ baseURL: origin });
    try {
      await signIn(other, "Synthetic مجيب");
      const title = `Stale check ${randomUUID().slice(0, 8)}`;
      const { communityId, postId } = await commentNotification(context, other, title);
      await page.goto(`/${locale}/communities`);
      await expect(page.getByRole("banner").getByRole("button", { name: text.notificationsUnread.replace("{count}", (1).toLocaleString(locale)), exact: true })).toBeVisible();
      // Open it from the full list: a client navigation that keeps the header.
      await openNotificationsFromShell(page, locale);
      await expect(page).toHaveURL(new RegExp(`/${locale}/notifications$`));
      await page.getByRole("button", { name: notificationText[locale].open, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/communities/${communityId}/posts/${postId}\\?notification=`));
      await expect(page.getByRole("banner").getByRole("button", { name: uiText[locale].notifications, exact: true })).toBeVisible();
      // A new display name shows in the account avatar at once.
      await openProfileFromShell(page, locale);
      const avatar = page.getByRole("banner").getByRole("button", { name: text.account, exact: true }).locator("bdi");
      await expect(avatar).toHaveText(avatarInitials("Synthetic طالب"));
      await page.getByLabel(identityText[locale].name, { exact: true }).fill("Zara نور");
      await page.getByRole("button", { name: identityText[locale].save, exact: true }).click();
      await expect(page.locator("#identity-feedback")).toHaveText(identityText[locale].saved);
      await expect(avatar).toHaveText(avatarInitials("Zara نور"));
    } finally { await other.close(); }
  });

  test(`${locale}: notifications preview shows a failure and keeps See all`, async ({ context, page }) => {
    await signIn(context);
    await page.goto(`/${locale}/communities`);
    await page.route("**/api/notifications", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
    await page.getByRole("button", { name: uiText[locale].notifications, exact: true }).click();
    const preview = page.getByRole("region", { name: text.notificationsPreview, exact: true });
    await expect(preview.getByRole("alert")).toHaveText(text.notificationsFailed);
    await expect(preview.getByRole("link", { name: text.notificationsSeeAll, exact: true })).toBeVisible();
  });

  test(`${locale}: 320px uses the bottom bar and the More dialog without horizontal scrolling`, async ({ context, page }) => {
    await signIn(context);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/${locale}/communities`);
    const bar = page.getByRole("navigation", { name: text.mobileNavigation, exact: true });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("navigation", { name: text.navigation, exact: true })).toBeHidden();
    await expect(page.getByRole("search")).toBeHidden();
    for (const name of [text.home, text.communities, text.search, text.messages]) await expect(bar.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(bar.getByRole("link", { name: text.communities, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(bar.getByRole("link", { name: text.search, exact: true })).toHaveAttribute("href", `/${locale}/search`);
    await fits(page);
    const more = bar.getByRole("button", { name: text.more, exact: true });
    await more.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: text.moreTitle, exact: true });
    await expect(dialog.getByRole("link", { name: text.profileSettings, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden(); await expect(more).toBeFocused();
    // The account menu and notifications stay in the header on phones.
    await expect(page.getByRole("button", { name: text.account, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: uiText[locale].notifications, exact: true })).toBeVisible();
  });

  test(`${locale}: unknown paths show the localized 404 with HTTP 404`, async ({ page }) => {
    const response = await page.goto(`/${locale}/no-such-page/deeper`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeAttached();
    await expect(page.getByRole("heading", { name: text.notFoundTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: text.backHome, exact: true })).toHaveAttribute("href", `/${locale}`);
  });
}

test("unsupported locales show the bilingual 404 with HTTP 404", async ({ page }) => {
  for (const path of ["/fr", "/EN", "/ar-SA"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
    for (const locale of locales) await expect(page.getByRole("link", { name: shellText[locale].backHome, exact: true })).toHaveAttribute("href", `/${locale}`);
  }
});

// Manual review aid with no assertions: runs only when asked for, with
// USP_VISUAL_TOUR=1 (screenshots land in the test output folder).
test("visual tour screenshots for review (light/dark × EN/AR × desktop/phone)", async ({ context, page }, testInfo) => {
  test.skip(process.env.USP_VISUAL_TOUR !== "1", "Manual review only: set USP_VISUAL_TOUR=1");
  test.setTimeout(90_000);
  await signIn(context);
  for (const theme of ["light", "dark"] as const) {
    await context.addCookies([{ name: "theme", value: theme, url: origin, sameSite: "Lax" }]);
    for (const locale of locales) {
      for (const [label, width] of [["desktop", 1360], ["phone", 320]] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${locale}`);
        await page.screenshot({ path: testInfo.outputPath(`home-${theme}-${locale}-${label}.png`) });
        await page.goto(`/${locale}/signin`);
        await page.screenshot({ path: testInfo.outputPath(`signin-${theme}-${locale}-${label}.png`) });
      }
    }
  }
  await context.clearCookies();
  await page.setViewportSize({ width: 1360, height: 800 });
  await page.goto("/en");
  await page.screenshot({ path: testInfo.outputPath("landing-en-desktop.png") });
  await page.goto("/en/missing-page");
  await page.screenshot({ path: testInfo.outputPath("not-found-en-desktop.png") });
  await page.goto("/fr");
  await page.screenshot({ path: testInfo.outputPath("global-not-found.png") });
});
