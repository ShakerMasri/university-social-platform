import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: process.env.M2_IDENTITY_E2E === "1" ? ["**/identity-disabled.spec.ts"] : ["**/identity.spec.ts", "**/communities.spec.ts", "**/posts.spec.ts"],
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
    timeout: 60_000,
  },
});
