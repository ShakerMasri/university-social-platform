import { expect, test } from "@playwright/test";

const cases = [
  { locale: "en", direction: "ltr", title: "University Social Learning Platform", heading: "Learning together, across academic years", skip: "Skip to main content", other: "العربية", target: "ar" },
  { locale: "ar", direction: "rtl", title: "منصة التعلم الاجتماعي الجامعية", heading: "نتعلم معًا عبر السنوات الدراسية", skip: "انتقل إلى المحتوى الرئيسي", other: "English", target: "en" },
] as const;

test("root uses a temporary redirect to the initial English default", async ({ request, page }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location).pathname).toBe("/en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

for (const item of cases) {
  test(`${item.locale}: translated shell, document direction, and keyboard language switching`, async ({ page }) => {
    const response = await page.goto(`/${item.locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", item.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", item.direction);
    await expect(page).toHaveTitle(item.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.heading);
    await expect(page.getByRole("banner")).toContainText(item.title);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("link", { name: item.locale === "en" ? "English" : "العربية", exact: true })).toHaveAttribute("aria-current", "page");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: item.skip });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await expect(skip).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    // Start a fresh navigation to check the language controls' natural tab order.
    await page.goto(`/${item.locale}`);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    if (item.locale === "en") await page.keyboard.press("Tab");
    const otherLanguage = page.getByRole("link", { name: item.other, exact: true });
    await expect(otherLanguage).toBeFocused();
    await expect(otherLanguage).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${item.target}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", item.target);
    await expect(page.locator("html")).toHaveAttribute("dir", item.target === "ar" ? "rtl" : "ltr");
  });

  test(`${item.locale}: narrow layout has no horizontal overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/${item.locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${item.locale}-mobile.png`), fullPage: true });
  });
}

test("unsupported locales and unknown paths return HTTP 404", async ({ page }) => {
  for (const path of ["/fr", "/EN", "/ar-SA", "/en/unknown"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  }
});
