import { OperationalError, parseOperationalJson } from "./operational-errors.ts";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertLocalPath, databaseDirectory, readPrivateFile } from "./runtime-files.ts";

import { assertIsolatedManifest, readIsolationProfile } from "./isolation.ts";
import { assertConfiguredManifestPort, readLocalDatabaseConfig, configuredPostgresPort } from "./local-database.ts";

export const manifestPath = resolve(databaseDirectory, "manifest.json");
export const image = "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c";
export type DatabaseRecord = { name: string; kind: "development" | "test"; ready: boolean };
export type LocalManifest = {
  version: 1; root: string; owner: string; project: string; container: string;
  dockerContext: string; dockerEndpoint: string;
  containerId: string | null; volume: string; port: number; image: string;
  migrationRole: string; migrationPassword: string; runtimeRole: string; runtimePassword: string;
  databases: DatabaseRecord[];
};

export function validateManifest(value: unknown): LocalManifest {
  if (!value || typeof value !== "object") throw new Error("Missing local database manifest");
  const m = value as LocalManifest;
  const owner = typeof m.owner === "string" && /^[a-f0-9]{12}$/.test(m.owner) ? m.owner : "";
  const prefix = `usp_m1b_${owner}`;
  if (
    !owner || m.version !== 1 || m.root !== resolve(".") || m.image !== image ||
    typeof m.dockerContext !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(m.dockerContext) ||
    !["npipe:////./pipe/dockerDesktopLinuxEngine", "npipe:////./pipe/docker_engine", "unix:///var/run/docker.sock"].includes(m.dockerEndpoint) ||
    m.project !== `usp-m1b-${owner}` || m.container !== `${m.project}-postgres` ||
    m.volume !== `${m.project}-data` || !Number.isInteger(m.port) || m.port < 1024 || m.port > 65535 ||
    m.migrationRole !== `${prefix}_migrate` || m.runtimeRole !== `${prefix}_runtime` ||
    !/^[a-f0-9]{64}$/.test(m.migrationPassword) || !/^[a-f0-9]{64}$/.test(m.runtimePassword) ||
    (m.containerId !== null && !/^[a-f0-9]{64}$/.test(m.containerId)) ||
    !Array.isArray(m.databases) ||
    m.databases.some((d) => !d || typeof d.name !== "string" || typeof d.ready !== "boolean" ||
      (d.kind === "development" ? d.name !== `${prefix}_dev` :
        d.kind !== "test" || !new RegExp(`^${prefix}_test_[a-f0-9]{12}$`).test(d.name))) ||
    new Set(m.databases.map((d) => d.name)).size !== m.databases.length ||
    m.databases.filter((d) => d.kind === "development").length !== 1
  ) throw new Error("Invalid project-local database manifest");
  return m;
}

function manifestMetadataError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const cause = new Error(code === "ENOENT" || code === "ENOTDIR" ? code : "Manifest metadata inspection failed");
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new Error("Local PostgreSQL setup has not been initialized; manifest is missing", { cause });
  }
  return new Error("Local PostgreSQL manifest metadata check failed; inspect permissions without printing credentials", { cause });
}

export function readManifest(): LocalManifest {
  const isolation = readIsolationProfile(), local = readLocalDatabaseConfig();
  configuredPostgresPort(local, isolation); // Reject conflicting public settings before credential access.
  try {
    assertLocalPath(manifestPath);
    lstatSync(manifestPath); // Metadata only; no contents before ACL verification.
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw manifestMetadataError(error);
  }
  const manifest = validateManifest(parseOperationalJson(readPrivateFile(manifestPath), "MANIFEST_JSON"));
  assertIsolatedManifest(manifest, isolation);
  assertConfiguredManifestPort(manifest.port, local, isolation);
  return manifest;
}

export function databaseUrl(m: LocalManifest, name: string, role: "runtime" | "migration") {
  return `postgresql://${role === "runtime" ? m.runtimeRole : m.migrationRole}:${role === "runtime" ? m.runtimePassword : m.migrationPassword}@127.0.0.1:${m.port}/${name}`;
}

export function validateTarget(value: unknown, m: LocalManifest, role: "runtime" | "migration") {
  validateManifest(m);
  if (typeof value !== "string" || !value) throw new Error("An explicit M1B database target is required");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid M1B database target"); }
  const name = url.pathname.slice(1);
  const record = m.databases.find((d) => d.name === name && d.ready);
  if (
    url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== String(m.port) ||
    url.search || url.hash || !record ||
    value !== databaseUrl(m, name, role)
  ) throw new Error("Refusing an unowned or mismatched database target");
  return name;
}

// Only for a workflow with a shadow database; current empty-schema diff needs none.
export function assertDistinctTargets(main: string, shadow: string, m: LocalManifest) {
  if (validateTarget(main, m, "migration") === validateTarget(shadow, m, "migration")) {
    throw new Error("Main and shadow databases must differ");
  }
}

export async function assertDatabaseIdentity(url: string, m: LocalManifest, role: "runtime" | "migration") {
  const name = validateTarget(url, m, role); // Reject malformed/remote targets before connecting.
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    const result = await client.query<{
      database: string; role: string; owner: string; markedDatabase: string;
      superuser: boolean; createDatabase: boolean; createRole: boolean;
    }>(`SELECT current_database() AS database, current_user AS role,
      g.owner, g.database AS "markedDatabase", r.rolsuper AS superuser,
      r.rolcreatedb AS "createDatabase", r.rolcreaterole AS "createRole"
      FROM __m1b.guard g JOIN pg_roles r ON r.rolname = current_user`);
    const row = result.rows[0];
    if (result.rows.length !== 1 || row.database !== name || row.markedDatabase !== name ||
      row.owner !== m.owner || row.role !== (role === "runtime" ? m.runtimeRole : m.migrationRole) ||
      row.superuser || row.createDatabase || row.createRole) {
      throw new Error("Database identity mismatch");
    }
  } catch {
    // Never propagate a driver error containing a connection URL or credentials.
    throw new Error("Project-local database identity check failed");
  } finally {
    await client.end();
  }
}
