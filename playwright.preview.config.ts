import { defineConfig, devices } from "@playwright/test";
import { localPreviewPort } from "./src/server/identity/local-policy";
const port = localPreviewPort(process.env.USP_LOCAL_PREVIEW_PORT ?? "3201");
export default defineConfig({
  testDir: "./tests/preview", workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI), reporter: "list",
  use: { baseURL: `http://localhost:${port}`, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node tools/identity/preview-server.mts check", url: `http://localhost:${port}/en/signin`, reuseExistingServer: false, timeout: 60_000 },
});
