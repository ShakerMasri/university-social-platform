import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

// Optional QA only. Importing this module never resolves user-specific paths.
export const manualHttpPort = 3200;
export const manualPostgresPort = 55433;
export function runtimeRootFor(platform: string, localAppData: string | undefined, checkout: string) {
  if (platform !== "win32") return resolve(checkout, ".cache/manual-qa");
  if (!localAppData || !isAbsolute(localAppData)) throw new Error("Windows local application data path unavailable");
  const id = createHash("sha256").update(resolve(checkout).toLowerCase()).digest("hex").slice(0, 24);
  return resolve(localAppData, `usp-runtime-${id}`);
}
export const manualPaths = {
  get runtimeDirectory() { return runtimeRootFor(process.platform, process.env.LOCALAPPDATA, resolve(".")); },
  get databaseDirectory() { return resolve(this.runtimeDirectory, "m1b"); },
  get bootstrapPasswordPath() { return resolve(this.databaseDirectory, "bootstrap-password"); },
  get manifestPath() { return resolve(this.databaseDirectory, "manifest.json"); },
  get browserControlPath() { return resolve(this.runtimeDirectory, "m2-browser.json"); },
  get lifecycleLockPath() { return resolve(this.runtimeDirectory, "local-db-operation.lock"); },
  get lifecycleGatePath() { return resolve(this.runtimeDirectory, "local-db-operation.gate"); },
  get manualDirectory() { return resolve(this.runtimeDirectory, "manual-identity"); },
  get manualSessionPath() { return resolve(this.manualDirectory, "session.json"); },
  get manualControlPath() { return resolve(this.manualDirectory, "control.json"); },
};
