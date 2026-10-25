import { assertDatabaseIdentity, readManifest } from "./manual-targets.ts";

try {
  await assertDatabaseIdentity(process.env.M1B_MIGRATION_URL ?? "", readManifest(), "migration");
} catch {
  process.stderr.write("Project-local migration target rejected\n");
  process.exitCode = 1;
}
