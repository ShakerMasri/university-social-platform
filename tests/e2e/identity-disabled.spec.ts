import { expect, test } from "@playwright/test";

test("ordinary startup leaves synthetic identity disabled", async ({ request, page }) => {
  test.skip(process.env.M2_IDENTITY_E2E === "1", "The dedicated owned identity harness is intentionally enabled");
  const response = await request.post("/api/identity/request", { data: { email: "synthetic@stu.najah.edu", locale: "en" }, headers: { Origin: "http://127.0.0.1:3100" } });
  expect(response.status()).toBe(503);
  await page.goto("/en/signin");
  await expect(page.getByText("Identity testing is available through the dedicated local test runner.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
