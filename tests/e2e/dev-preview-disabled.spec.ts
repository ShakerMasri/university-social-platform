import { expect, test } from "@playwright/test";

// The component preview is development-only: ordinary `next start` has no
// synthetic local context, so the route must not exist, whatever the request.
test("ordinary startup does not serve the component preview", async ({ request }) => {
  test.skip(process.env.M2_IDENTITY_E2E === "1", "The dedicated owned identity harness intentionally enables the preview");
  for (const locale of ["en", "ar"]) {
    for (const path of [`/${locale}/dev/components`, `/${locale}/dev/components?dev=1&mode=preview`]) {
      const response = await request.get(path, { headers: { "X-Usp-Peer": "127.0.0.1", "X-Usp-Peer-Signature": "a".repeat(64) } });
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("data-preview-panel");
    }
  }
});
