import { defineConfig, devices } from "@playwright/test";
const authenticated = process.env.M2_IDENTITY_E2E === "1";
const archiveOnly = authenticated && process.env.M2_BROWSER_GROUP === "archive";
const emptyOnly = authenticated && process.env.M2_BROWSER_GROUP === "empty";
const messagingOnly = authenticated && process.env.M2_BROWSER_GROUP === "messaging";
const emptyDiscovery = /empty community discovery is localized in English and Arabic/;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: messagingOnly ? ["**/messaging.spec.ts"] : archiveOnly ? ["**/archive.spec.ts"] : emptyOnly ? ["**/communities.spec.ts"] : undefined,
  grep: emptyOnly ? emptyDiscovery : undefined,
  grepInvert: authenticated && !emptyOnly ? emptyDiscovery : undefined,
  testIgnore: process.env.M2_IDENTITY_E2E === "1" ? ["**/identity-disabled.spec.ts", ...(archiveOnly ? [] : ["**/archive.spec.ts"]), ...(messagingOnly ? [] : ["**/messaging.spec.ts"])] : ["**/identity.spec.ts", "**/communities.spec.ts", "**/posts.spec.ts", "**/comments.spec.ts", "**/votes.spec.ts", "**/replies-notifications.spec.ts", "**/ui-layout.spec.ts", "**/ui-zoom.spec.ts", "**/discussion-actions.spec.ts", "**/archive.spec.ts", "**/people.spec.ts", "**/messaging.spec.ts"],
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
