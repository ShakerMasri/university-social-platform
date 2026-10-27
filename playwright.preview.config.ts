import { defineConfig, devices } from "@playwright/test";
import { localPreviewPort } from "./src/server/identity/local-policy";
const port = localPreviewPort(process.env.USP_LOCAL_PREVIEW_PORT ?? "3201");
const development = process.env.USP_LOCAL_DEVELOPMENT_CHECK === "1";
export default defineConfig({
  testDir: "./tests/preview", workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI), reporter: "list",
  testMatch: "**/local-preview.spec.ts",
  timeout: development ? 90_000 : 30_000,
  use: { baseURL: `http://localhost:${port}`, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: `node tools/identity/preview-server.mts ${development ? "check-dev" : "check"}`, url: `http://localhost:${port}/en/signin`, reuseExistingServer: false, timeout: 60_000 },
});
