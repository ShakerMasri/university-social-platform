import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: process.env.M2_IDENTITY_E2E === "1" ? ["**/identity-disabled.spec.ts"] : ["**/identity.spec.ts", "**/communities.spec.ts", "**/posts.spec.ts", "**/comments.spec.ts", "**/votes.spec.ts", "**/replies-notifications.spec.ts"],
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.M2_IDENTITY_E2E === "1" ? "node tools/identity/local-server.mts" : "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/en",
    reuseExistingServer: false,
    // Accidental local-tool flags cannot install the in-memory identity context
    // in normal production startup. Keep this regression in the ordinary suite.
    env: process.env.M2_IDENTITY_E2E === "1" ? {} : {
      USP_LOCAL_DEVELOPMENT_CHECK: "1", USP_LOCAL_PREVIEW_PORT: "3100",
      M2_IDENTITY_E2E: "1", NODE_ENV: "production",
    },
    timeout: 60_000,
  },
});
