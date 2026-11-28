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
// The default config serves the existing production build (`next start` or the
// local identity server), so build first: a suite can never run against old
// code, whatever was edited, added, renamed or deleted. With the Next.js cache
// this takes seconds. Exempt, matched exactly by path: the feed component
// config (no app server) and the preview config (`test:dev:local` compiles in
// development mode; `test:preview:local` serves the existing build, so build
// before it, as README says). Any other config value builds.
const forwarded = process.argv.slice(2);
const samePath = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
const exemptConfigs = new Set(["playwright.feed-component.config.ts", "playwright.preview.config.ts"].map(samePath));
function configArgument(): string | undefined {
  for (const [index, argument] of forwarded.entries()) {
    if (argument === "--config" || argument === "-c") return forwarded[index + 1];
    if (argument.startsWith("--config=")) return argument.slice("--config=".length);
    if (/^-c[^-]/.test(argument)) return argument.slice(2);
  }
  return undefined;
}
const config = configArgument();
// Never rebuild `.next` under a running server: a dev or preview server, a
// manual QA session that pins the build, or another browser suite registers one
// of these control files while it runs (the same files the local tools check).
const runningServers = [".cache/m2-preview.json", ".cache/m2-preview-check.json", ".cache/m2-browser.json", ".cache/manual-qa.json"];
if (config === undefined || !exemptConfigs.has(samePath(config))) {
  const active = runningServers.filter(path => existsSync(resolve(path)));
  if (active.length > 0) {
    console.error(`A local server or browser suite is running or needs inspection (${active.join(", ")}). Stop it (npm run dev:stop, npm run preview:stop or npm run qa:feed:windows:stop) before the browser suites rebuild the app.`);
    process.exit(1);
  }
  const build = spawnSync(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build"], {
    env: { ...environment, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", windowsHide: true,
  });
  if (build.error || build.status !== 0) {
    console.error("The production build failed, so the browser suites did not start; run npm run build for diagnostics");
    process.exit(1);
  }
}
const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), ...forwarded], {
  env: environment, stdio: "inherit", windowsHide: true,
});
if (result.error) console.error("Playwright could not start; check the installed runtime and dependencies");
process.exitCode = result.status ?? 1;
