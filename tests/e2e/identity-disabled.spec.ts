import { expect, test } from "@playwright/test";

test("ordinary startup leaves synthetic identity disabled", async ({ request, page }) => {
  test.skip(process.env.M2_IDENTITY_E2E === "1", "The dedicated owned identity harness is intentionally enabled");
  const response = await request.post("/api/identity/request", { data: { email: "synthetic@stu.najah.edu", locale: "en" }, headers: { Origin: "http://127.0.0.1:3100" } });
  expect(response.status()).toBe(503);
  expect((await request.post("/api/identity/request?mode=preview&dev=1", {
    data: { email: "synthetic@university.test", locale: "en" },
    headers: { Origin: "http://127.0.0.1:3100", "X-Usp-Peer": "127.0.0.1", "X-Usp-Peer-Signature": "a".repeat(64), "X-Role": "admin" },
  })).status()).toBe(503);
  expect((await request.post("/__local-preview/confirmation", { data: { email: "synthetic@university.test" }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(404);
  await page.goto("/en/signin");
  await expect(page.getByText("Identity testing is available through the dedicated local test runner.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect((await request.get("/api/communities")).status()).toBe(503);
  expect((await request.post("/api/communities", { data: { name: "Synthetic", description: "", visibility: "PUBLIC" }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(503);
  const id = "11111111-2222-3333-4444-555555555555";
  expect((await request.get(`/api/communities/${id}/posts`)).status()).toBe(503);
  expect((await request.get(`/api/communities/${id}/posts/${id}`)).status()).toBe(503);
  expect((await request.get(`/api/communities/${id}/posts/${id}/comments`)).status()).toBe(503);
  for (const path of [`/api/communities/${id}/posts/${id}/vote`, `/api/communities/${id}/posts/${id}/comments/${id}/vote`]) {
    expect((await request.put(path, { data: { active: true }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(503);
  }
  expect((await request.post(`/api/communities/${id}/posts/${id}/comments`, { data: {}, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(503);
  expect((await request.post(`/api/communities/${id}/posts`, { data: {}, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(503);
  await page.goto("/ar/communities");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
