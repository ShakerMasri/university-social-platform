import { defineConfig } from "prisma/config";
import { execFileSync } from "node:child_process";
import { readManifest, validateTarget } from "./tools/database/manual-targets.ts";

// Validation/generation need no database. This Windows schema engine requires
// a datasource argument for diff; the wrapper supplies only a guarded local URL.
// Any CLI operation with a URL must pass the same project-local identity check.
const url = process.env.M1B_MIGRATION_URL;
if (url) {
  validateTarget(url, readManifest(), "migration");
  try {
    execFileSync(process.execPath, ["tools/database/manual-check-target.mts"], { stdio: "pipe", timeout: 15000 });
  } catch {
    throw new Error("Refusing migration: project-local identity check failed");
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
