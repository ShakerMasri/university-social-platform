import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/feed-component",
  workers: 1,
  reporter: "list",
  forbidOnly: Boolean(process.env.CI),
  use: { ...devices["Desktop Chrome"], channel: "chromium", serviceWorkers: "block" },
});
