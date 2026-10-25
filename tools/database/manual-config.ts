import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { OperationalError } from "./operational-errors.ts";
import { manualPostgresPort } from "./manual-paths.ts";

export type ManualDatabaseConfig = { version: 1; root: string; postgresPort: number };
export function readManualDatabaseConfig(checkout = resolve(".")): ManualDatabaseConfig | null {
  const path = resolve(checkout, "manual-qa.json");
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw new OperationalError("MANUAL_CONFIG");
  }
  try {
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    const c = JSON.parse(readFileSync(path, "utf8")) as ManualDatabaseConfig;
    if (!c || Object.keys(c).sort().join(",") !== "postgresPort,root,version" || c.version !== 1 ||
        typeof c.root !== "string" || !isAbsolute(c.root) || c.root !== checkout ||
        !Number.isInteger(c.postgresPort) || c.postgresPort < 1024 || c.postgresPort > 65535) throw new Error();
    return c;
  } catch { throw new OperationalError("MANUAL_CONFIG"); }
}
export function configuredManualPort(config: ManualDatabaseConfig | null) {
  return config?.postgresPort ?? manualPostgresPort;
}
export function assertManualManifestPort(port: number, config: ManualDatabaseConfig | null) {
  if (config && port !== config.postgresPort) throw new OperationalError("LOCAL_PORT_CONFLICT");
}
