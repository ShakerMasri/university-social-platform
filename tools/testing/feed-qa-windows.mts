import { closeSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { LocalManifest } from "../database/targets.ts";

export function assertFeedQaWindows() {
  if (process.platform !== "win32" || process.arch !== "x64" || !/^[a-z]:\\/i.test(resolve(".")) ||
      Object.keys(process.env).some(key => /^(DOCKER_|PG[A-Z]|(?:DIRECT_|SHADOW_)?DATABASE_URL$|M1B_|M2_|M4_FEED_|USP_|PLAYWRIGHT_|PWDEBUG$|NODE_OPTIONS$|NODE_ENV$|CI$)/i.test(key))) {
    throw new Error("Feed QA for Windows requires a clean x64 Windows shell and a local checkout");
  }
  for (const path of [".", ".cache", ".cache/m1b", ".cache/m1b/manifest.json", ".next", "node_modules", "src/generated"]) {
    try {
      if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== resolve(path)) {
        throw new Error("Feed QA for Windows refuses redirected resource paths");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path === ".") throw error;
    }
  }
}

export function assertWindowsFeedQaManifest(manifest: LocalManifest, snapshot: string) {
  if (!manifest.containerId || manifest.feedQaWindowsSnapshot !== snapshot) {
    throw new Error("Feed QA for Windows requires the dedicated setup for this approved snapshot");
  }
}

// Serialize scaffold setup/cleanup and phase allocation. A running phase is
// guarded by its own active registration and authenticated supervisor.
export async function withWindowsFeedQaLock<T>(operation: () => Promise<T>): Promise<T> {
  mkdirSync(".cache", { recursive: true });
  const path = resolve(".cache/feed-qa-windows.lock");
  let handle: number;
  try { handle = openSync(path, "wx", 0o600); }
  catch { throw new Error("Windows Feed QA operation lock is present or unavailable; preserve resources and inspect status"); }
  try { return await operation(); }
  finally { closeSync(handle); unlinkSync(path); }
}
