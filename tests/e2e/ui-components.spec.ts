import { expect, test, type Page } from "@playwright/test";
import { componentPreviewText } from "../../src/i18n/component-preview";
import { uiText } from "../../src/i18n/ui";
import { voteText } from "../../src/i18n/votes";

// Stage 0 of the UI rebuild: the development-only component preview in both
// themes and both locales, theme persistence without a flash, keyboard focus
// handling, and self-hosted fonts. Runs only under the synthetic launcher,
// which is what enables the preview route.

const origin = "http://127.0.0.1:3100";
const locales = ["en", "ar"] as const;
const tokens = {
  light: { bg: "rgb(245, 246, 248)", surface: "rgb(255, 255, 255)", accent: "rgb(79, 70, 229)" },
  dark: { bg: "rgb(15, 18, 24)", surface: "rgb(23, 27, 35)", accent: "rgb(129, 140, 248)" },
} as const;

test.use({ trace: "off", screenshot: "off", video: "off" });

const pageRoot = (page: Page) => page.locator("body > .ui-root").first();
const panel = (page: Page, theme: "light" | "dark") => page.locator(`[data-preview-panel="${theme}"]`);
const background = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

async function setThemeCookie(page: Page, value: "light" | "dark") {
  await page.context().addCookies([{ name: "theme", value, url: origin, sameSite: "Lax" }]);
}

for (const locale of locales) {
  const text = componentPreviewText[locale];
  const ui = uiText[locale];

  test(`${locale}: preview renders every component in light and dark`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    const response = await page.goto(`/${locale}/dev/components`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { level: 1, name: text.title })).toBeVisible();

    for (const theme of ["light", "dark"] as const) {
      const section = panel(page, theme);
      await expect(section.getByRole("heading", { level: 2, name: theme === "light" ? text.lightTheme : text.darkTheme })).toBeVisible();
      expect(await background(section)).toBe(tokens[theme].bg);
      expect(await background(section.locator("article").first())).toBe(tokens[theme].surface);
      for (const heading of [text.buttons, text.iconButtons, text.fields, text.chips, text.badges, text.avatars, text.postCard,
        text.tabs, text.menu, text.dialog, text.toasts, text.votes, text.states, text.skeletons, text.icons]) {
        await expect(section.getByRole("heading", { level: 3, name: heading, exact: true })).toBeVisible();
      }
      // Field wiring: label, hint and error are programmatically linked.
      const email = section.getByRole("textbox", { name: text.emailLabel });
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(email).toHaveAccessibleDescription(text.emailError);
      await expect(section.getByRole("textbox", { name: text.titleLabel })).toHaveAccessibleDescription(text.titleHint);
      await expect(section.getByRole("radiogroup", { name: text.typeLegend }).or(section.getByRole("group", { name: text.typeLegend }))).toBeVisible();
    }

    // Arabic mirrors with logical properties: the post card's type badge sits at the inline end.
    const header = panel(page, "light").locator("article").first();
    const avatarBox = await header.locator("[aria-hidden='true']").first().boundingBox();
    const badgeBox = await header.getByText(locale === "en" ? "Question" : "سؤال", { exact: true }).boundingBox();
    expect(avatarBox && badgeBox).toBeTruthy();
    if (locale === "ar") expect(badgeBox!.x).toBeLessThan(avatarBox!.x);
    else expect(badgeBox!.x).toBeGreaterThan(avatarBox!.x);

    // Self-hosted fonts: every request stays on this origin.
    await page.evaluate(() => document.fonts.ready);
    expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"))).toEqual([]);
    expect(requests.some((url) => url.includes(".woff2"))).toBe(true);
    if (locale === "ar") expect(requests.some((url) => url.includes("IBMPlexSansArabic"))).toBe(true);
  });

  test(`${locale}: theme follows the system, then a stored choice, with no script before paint`, async ({ browser }) => {
    // JavaScript disabled: the first paint must already have the right theme.
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ javaScriptEnabled: false, colorScheme });
      const page = await context.newPage();
      await page.goto(`/${locale}/dev/components`);
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
      expect(await background(pageRoot(page))).toBe(tokens[colorScheme].bg);
      for (const stored of ["light", "dark"] as const) {
        await setThemeCookie(page, stored);
        await page.goto(`/${locale}/dev/components`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", stored);
        expect(await background(pageRoot(page))).toBe(tokens[stored].bg);
        // The toggle icon is chosen by CSS too: sun in dark, moon in light.
        const toggle = page.getByRole("button", { name: ui.darkTheme });
        await expect(toggle.locator("svg").nth(stored === "dark" ? 1 : 0)).toBeVisible();
        await expect(toggle.locator("svg").nth(stored === "dark" ? 0 : 1)).toBeHidden();
      }
      await context.close();
    }
  });

  test(`${locale}: theme toggle persists the choice across reloads`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`/${locale}/dev/components`);
    const toggle = page.getByRole("button", { name: ui.darkTheme });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await background(pageRoot(page))).toBe(tokens.dark.bg);
    const cookie = (await context.cookies(origin)).find((item) => item.name === "theme");
    expect(cookie?.value).toBe("dark");
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(300 * 24 * 3600);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: ui.darkTheme })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: ui.darkTheme }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });

  test(`${locale}: keyboard reaches controls, focus is visible and returns after menus and dialogs`, async ({ page }) => {
    await page.goto(`/${locale}/dev/components`);
    await expect(page.getByRole("button", { name: ui.darkTheme })).toBeEnabled();

    // Skip link is the first stop and moves focus to the main content.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: locale === "en" ? "Skip to main content" : "انتقل إلى المحتوى الرئيسي" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#preview-main")).toBeFocused();

    for (const theme of ["light", "dark"] as const) {
      const section = panel(page, theme);
      // Visible focus ring in the theme's accent, at least 3px.
      const primary = section.getByRole("button", { name: text.primary, exact: true });
      await primary.focus();
      const ring = await primary.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
      });
      expect(ring).toEqual({ style: "solid", width: 3, color: tokens[theme].accent });

      // Menu button: Enter opens on the first item, arrows move, Escape returns focus.
      const trigger = section.getByRole("button", { name: ui.moreActions });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const menu = section.getByRole("menu", { name: ui.moreActions });
      await expect(menu.getByRole("menuitem", { name: text.menuOpenPost })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: text.menuCopy })).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem", { name: text.menuReport })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: text.menuOpenPost })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      // Choosing an action closes the menu, returns focus and announces the result.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: text.toastInfoMessage })).toHaveCount(1);

      // Modal dialog: focus moves inside, Escape closes, focus returns to the trigger.
      const opener = section.getByRole("button", { name: text.openDialog });
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: text.dialogTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(text.dialogDescription);
      await expect(dialog.getByRole("button", { name: ui.close })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      // onClose runs exactly once per close (Escape also queues a native close event).
      const closes = section.locator("[data-dialog-closes]");
      await expect(closes).toHaveText(text.dialogClosed(1));
      // Footer actions also return focus (keyboard only, so focus stays visible).
      await page.keyboard.press("Enter");
      await expect(dialog.getByRole("button", { name: ui.close })).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: text.dialogConfirm })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      await expect(closes).toHaveText(text.dialogClosed(2));
    }
  });

  test(`${locale}: vote, chips and toasts report state accessibly`, async ({ page }) => {
    await page.goto(`/${locale}/dev/components`);
    const card = panel(page, "light").locator("article").first();
    const votes = card.getByRole("group", { name: voteText[locale].group });
    const up = votes.getByRole("button", { name: voteText[locale].add });
    const down = votes.getByRole("button", { name: voteText[locale].down });
    await expect(up).toBeEnabled();
    await expect(up).toHaveAttribute("aria-pressed", "false");
    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(up).toHaveAccessibleDescription(new RegExp(voteText[locale].upvotes));
    await down.click();
    await expect(up).toHaveAttribute("aria-pressed", "false");
    await expect(down).toHaveAttribute("aria-pressed", "true");
    await down.click();
    await expect(down).toHaveAttribute("aria-pressed", "false");

    const section = panel(page, "light");
    const unread = section.getByRole("button", { name: text.filterUnread });
    await expect(unread).toHaveAttribute("aria-pressed", "true");
    await unread.click();
    await expect(unread).toHaveAttribute("aria-pressed", "false");
    // Choice chips are native radios: arrow keys move the selection.
    const types = section.getByRole("radio");
    await types.first().focus();
    await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    await expect(types.nth(1)).toBeChecked();

    // Toasts: dismissing a focused toast moves focus to the next one, then back to the trigger.
    const errorTrigger = section.getByRole("button", { name: text.toastError });
    const errorMessages = page.getByRole("alert").locator("p", { hasText: text.toastErrorMessage });
    await errorTrigger.click();
    await errorTrigger.click();
    await expect(errorMessages).toHaveCount(2);
    const dismissButtons = page.locator("[data-toast-dismiss]");
    await dismissButtons.first().focus();
    await page.keyboard.press("Enter");
    await expect(errorMessages).toHaveCount(1);
    await expect(dismissButtons).toHaveCount(1);
    await expect(dismissButtons.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(errorMessages).toHaveCount(0);
    await expect(errorTrigger).toBeFocused();
    // Toasts render inside the themed UI root (font and base styles apply).
    await section.getByRole("button", { name: text.toastInfo }).click();
    const toast = page.locator(".ui-root [data-toast-dismiss]").first();
    await expect(toast).toBeVisible();
    // After keyboard dismissal the countdown is not left paused: success toasts still hide.
    await page.mouse.move(0, 0);
    await expect(page.getByRole("status").locator("p", { hasText: text.toastInfoMessage })).toHaveCount(0, { timeout: 10_000 });

    // The loading placeholder announces its label once mounted, outside the busy region.
    const loading = section.getByRole("status").filter({ hasText: text.loadingPosts });
    await expect(loading).toHaveCount(1);
    expect(await loading.evaluate((element) => element.closest("[aria-busy='true']") === null)).toBe(true);
  });

  test(`${locale}: preview reflows at 320px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/${locale}/dev/components`);
    await expect(page.getByRole("heading", { level: 1, name: text.title })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
