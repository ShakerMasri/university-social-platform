import { expect, test } from "@playwright/test";
import { dictionaries } from "../../src/i18n/dictionaries";
import { shellText } from "../../src/i18n/shell";

// Runs under ordinary `next start` (no identity provider): every visitor is
// anonymous. Covers the locale shell, language switching, the skip link,
// narrow layouts, the landing page's session recheck and localized 404s.
const cases = [
  { locale: "en", direction: "ltr", other: "العربية", target: "ar" },
  { locale: "ar", direction: "rtl", other: "English", target: "en" },
] as const;

test("root uses a temporary redirect to the initial English default", async ({ request, page }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location).pathname).toBe("/en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

test("unused image optimization endpoint is disabled", async ({ request }) => {
  const response = await request.get("/_next/image?url=%2Fen&w=640&q=75");
  expect(response.status()).toBe(404);
});

for (const item of cases) {
  const site = dictionaries[item.locale], text = shellText[item.locale];

  test(`${item.locale}: translated shell, document direction, skip link and keyboard language switching`, async ({ page }) => {
    const response = await page.goto(`/${item.locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", item.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", item.direction);
    await expect(page).toHaveTitle(site.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(site.heading);
    await expect(page.getByRole("banner").getByRole("link", { name: site.title, exact: true })).toHaveAttribute("href", `/${item.locale}`);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    // An anonymous visitor gets Sign in and no account controls.
    await expect(page.getByRole("banner").getByRole("link", { name: text.signIn, exact: true })).toHaveAttribute("href", `/${item.locale}/signin`);
    await expect(page.getByRole("button", { name: text.account, exact: true })).toHaveCount(0);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: site.skipToContent });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await expect(skip).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    const otherLanguage = page.getByRole("link", { name: item.other, exact: true });
    await expect(otherLanguage).toHaveAttribute("lang", item.target);
    await otherLanguage.focus();
    await expect(otherLanguage).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${item.target}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", item.target);
    await expect(page.locator("html")).toHaveAttribute("dir", item.target === "ar" ? "rtl" : "ltr");
  });

  test(`${item.locale}: language switching keeps the path and query`, async ({ page }) => {
    await page.goto(`/${item.locale}/signin?from=test`);
    await page.getByRole("link", { name: item.other, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${item.target}/signin\\?from=test$`));
  });

  for (const width of [320, 360]) {
    test(`${item.locale}: ${width}px layout has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["", "/signin", "/no-such-page"]) {
        await page.goto(`/${item.locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
      }
    });
  }

  test(`${item.locale}: home rechecks the server on focus and history restoration without losing keyboard focus`, async ({ page }) => {
    await page.goto(`/${item.locale}`);
    await page.waitForLoadState("networkidle");
    const skip = page.getByRole("link", { name: site.skipToContent });
    await skip.focus();
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === `/${item.locale}` && response.request().headers().rsc === "1");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect((await refreshed).status()).toBe(200);
    await expect(skip).toBeFocused();
    await page.locator(`main a[href='/${item.locale}/signin']`).click();
    await expect(page).toHaveURL(new RegExp(`/${item.locale}/signin$`));
    const restored = page.waitForResponse(response => new URL(response.url()).pathname === `/${item.locale}` && response.request().headers().rsc === "1");
    await page.goBack();
    expect((await restored).status()).toBe(200);
    await expect(page.locator(`main a[href='/${item.locale}/signin']`)).toBeVisible();
  });

  test(`${item.locale}: unknown paths return HTTP 404 with the localized page`, async ({ page }) => {
    const response = await page.goto(`/${item.locale}/unknown`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("dir", item.direction);
    await expect(page.getByRole("heading", { name: text.notFoundTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: text.backHome, exact: true })).toHaveAttribute("href", `/${item.locale}`);
  });
}

test("unsupported locales return HTTP 404 with a bilingual page", async ({ page }) => {
  for (const path of ["/fr", "/EN", "/ar-SA", "/fr/communities"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeAttached();
    for (const locale of ["en", "ar"] as const) {
      await expect(page.getByRole("link", { name: shellText[locale].backHome, exact: true })).toHaveAttribute("href", `/${locale}`);
    }
  }
});
