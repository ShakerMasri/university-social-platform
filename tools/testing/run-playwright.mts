import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Set browser discovery before Playwright loads its executable registry. Keep an
// explicit caller override; otherwise reuse this checkout's installed browsers.
const environment = { ...process.env };
const projectCache = resolve(".cache/ms-playwright");
if (!environment.PLAYWRIGHT_BROWSERS_PATH && existsSync(projectCache)) {
  environment.PLAYWRIGHT_BROWSERS_PATH = projectCache;
  console.log("Using project-local Playwright browser cache (.cache/ms-playwright)");
}
const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), ...process.argv.slice(2)], {
  env: environment, stdio: "inherit", windowsHide: true,
});
if (result.error) console.error("Playwright could not start; check the installed runtime and dependencies");
process.exitCode = result.status ?? 1;
