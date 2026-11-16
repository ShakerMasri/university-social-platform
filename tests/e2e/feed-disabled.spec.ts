import { expect, test } from "@playwright/test";
import { feedText } from "../../src/i18n/feed";
test("ordinary startup keeps feed disabled despite forged credentials and local flags", async ({ context, page }) => {
  await context.addCookies([{ name: "usp_m2_session", value: "a".repeat(43), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  const response = await context.request.get("/api/feed?after=forged", { headers: { "X-Usp-Peer": "127.0.0.1", "X-Usp-Peer-Signature": "a".repeat(64), "X-Role": "admin" } });
  expect(response.status()).toBe(503); expect(response.headers()["cache-control"]).toContain("no-store");
  for (const locale of ["en", "ar"] as const) {
    await page.goto(`/${locale}/feed`); await expect(page.getByRole("main").getByRole("alert")).toHaveText(feedText[locale].failed);
    await expect(page.locator(".post-card")).toHaveCount(0);
  }
});
