import { spawnSync } from "node:child_process";

// Build artifacts only; no QA runtime, configuration, credentials or resources.
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  env: { ...process.env, USP_MANUAL_BUILD: "1" }, stdio: "inherit", windowsHide: true,
});
if (result.error || result.status !== 0) {
  console.error("Manual QA application build failed");
  process.exitCode = 1;
}
