import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { IsolationProfile } from "./isolation.ts";
import { OperationalError } from "./operational-errors.ts";
import { postgresHostPort } from "./ports.ts";

export type LocalDatabaseConfig = { version: 1; root: string; postgresPort: number };
export function validateLocalDatabaseConfig(value: unknown, checkout = resolve(".")): LocalDatabaseConfig {
  const c = value as LocalDatabaseConfig;
  if (!c || Object.keys(c).sort().join(",") !== "postgresPort,root,version" || c.version !== 1 ||
      typeof c.root !== "string" || !isAbsolute(c.root) || c.root !== resolve(checkout) ||
      !Number.isInteger(c.postgresPort) || c.postgresPort < 1024 || c.postgresPort > 65535) throw new OperationalError("LOCAL_CONFIG");
  return c;
}
export function readLocalDatabaseConfig(checkout = resolve(".")): LocalDatabaseConfig | null {
  const path = resolve(checkout, "local-database.json");
  let stat, missing = false;
  try { stat = lstatSync(path); }
  catch (error) { missing = !!error && typeof error === "object" && "code" in error && error.code === "ENOENT"; }
  if (!stat) {
    if (missing) return null;
    throw new OperationalError("LOCAL_CONFIG");
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new OperationalError("LOCAL_CONFIG");
  try { return validateLocalDatabaseConfig(JSON.parse(readFileSync(path, "utf8")), checkout); }
  catch { throw new OperationalError("LOCAL_CONFIG"); }
}
export function configuredPostgresPort(local: LocalDatabaseConfig | null, isolated: IsolationProfile | null): number {
  if (local && isolated && local.postgresPort !== isolated.postgresPort) throw new OperationalError("LOCAL_PORT_CONFLICT");
  return isolated?.postgresPort ?? local?.postgresPort ?? postgresHostPort;
}
export function assertConfiguredManifestPort(port: number, local: LocalDatabaseConfig | null, isolated: IsolationProfile | null) {
  const selected = configuredPostgresPort(local, isolated);
  // Absence of an override does not impose a new default on registered resources.
  if ((local || isolated) && port !== selected) throw new OperationalError("LOCAL_PORT_CONFLICT");
}
