import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { LocalManifest } from "./targets.ts";

export type IsolationProfile = {
  version: 1; root: string; sourceRoot: string; sourceOwner: string; sourcePort: number;
  owner: string; postgresPort: number;
};
const port = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1024 && Number(value) <= 65535;
export function validateIsolationProfile(value: unknown, checkout = resolve(".")): IsolationProfile {
  const p = value as IsolationProfile;
  if (!p || Object.keys(p).sort().join(",") !== "owner,postgresPort,root,sourceOwner,sourcePort,sourceRoot,version" ||
      p.version !== 1 || typeof p.root !== "string" || typeof p.sourceRoot !== "string" ||
      !isAbsolute(p.root) || !isAbsolute(p.sourceRoot) || p.root !== resolve(checkout) ||
      p.root !== resolve(p.sourceRoot + "-qa-isolated") || p.sourceRoot === p.root ||
      typeof p.owner !== "string" || typeof p.sourceOwner !== "string" || !/^[a-f0-9]{12}$/.test(p.owner) || !/^[a-f0-9]{12}$/.test(p.sourceOwner) || p.owner === p.sourceOwner ||
      !port(p.sourcePort) || !port(p.postgresPort) || p.postgresPort === p.sourcePort) {
    throw new Error("Isolated QA configuration refused; no fallback to source resources");
  }
  return p;
}
export function readIsolationProfile(checkout = resolve(".")): IsolationProfile | null {
  const path = resolve(checkout, "qa-isolation.json");
  let stat, code: unknown;
  try { stat = lstatSync(path); }
  catch (error) {
    code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  }
  // Classify without retaining a raw filesystem exception as a public cause.
  if (!stat) {
    if (code !== "ENOENT" && code !== "ENOTDIR") throw new Error("Isolated QA configuration unreadable; no fallback allowed");
    if (resolve(checkout).toLowerCase().endsWith("-qa-isolated")) throw new Error("Isolated QA configuration missing; no default setup allowed");
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Isolated QA configuration must be a regular file");
  try { return validateIsolationProfile(JSON.parse(readFileSync(path, "utf8")), checkout); }
  catch { throw new Error("Isolated QA configuration invalid or unreadable; no source fallback allowed"); }
}
// Profile is loaded before manifest access. Refuse identity mismatch before callers use its credentials.
export function assertIsolatedManifest(m: LocalManifest, p: IsolationProfile | null) {
  if (p && (m.root !== p.root || m.owner !== p.owner || m.port !== p.postgresPort)) {
    throw new Error("Isolated QA manifest identity mismatch; source adoption refused");
  }
}
export function assertNoResourceCollisions(m: LocalManifest, containers: string, volumes: string) {
  const collides = (listing: string, name: string) => listing.split(/\r?\n/).filter(Boolean).some((line) => {
    const fields = line.split("\t");
    if (fields.length !== 3) throw new Error("Resource inventory incomplete; setup refused");
    return fields[0] === name || fields[1] === m.project || fields[2] === m.owner;
  });
  if (collides(containers, m.container) || collides(volumes, m.volume)) {
    throw new Error("Refusing to adopt pre-existing local resources");
  }
}
