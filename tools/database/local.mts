import { formatOperationalError, parseOperationalJson } from "./operational-errors.ts";
import { finishManualRun } from "./manual-shutdown.ts";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Client } from "pg";
import { composeEnvironment, validateComposeConfig } from "./compose.ts";
import { ensurePortFree, ensurePostgresPortAvailable } from "./ports.ts";
import { readLocalDatabaseConfig, configuredPostgresPort } from "./local-database.ts";
import {
  assertDatabaseIdentity, databaseUrl, image, manifestPath, readManifest, validateManifest,
  type LocalManifest, type DatabaseRecord,
} from "./targets.ts";
import {
  acquireLifecycleLock, assertLocalPath, authorizeManualOperation, beginManualRun, checkManualFiles, cleanupSession,
  lifecycleLockPath, manualControlPath, manualSessionPath, newManualSession, prepareSession, readManualSession,
  stoppedSession, validateManualControl, writeManualSession, type ManualSession,
} from "./manual-session.ts";
import { type LifecycleLease } from "./lifecycle-lock.ts";
import { inspectProcesses } from "./windows-process.ts";
import { recoverManualQa, RecoveryRefusal } from "./manual-recovery.ts";
import { deliverManualToken, requestManualToken, syntheticManualEmail } from "../identity/manual-mailbox.ts";

import { assertPrivatePath, browserControlPath, databaseDirectory, readPrivateFile, writePrivateFile } from "./runtime-files.ts";

import { assertNoResourceCollisions, readIsolationProfile } from "./isolation.ts";

let isolation: ReturnType<typeof readIsolationProfile>;
let localConfiguration: ReturnType<typeof readLocalDatabaseConfig>;
const localDirectory = dirname(manifestPath);
const composeFile = resolve("compose.m1b.yaml");
const bootstrapRole = "usp_m1b_bootstrap";

function execute(command: string, args: string[], input?: string, env = process.env) {
  const result = spawnSync(command, args, { input, env, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    // Driver/CLI diagnostics may contain URLs, passwords or SQL. Do not echo them.
    throw new Error(`${command === "docker" ? "Docker" : "Local tool"} operation failed; no sensitive diagnostics printed`);
  }
  return result.stdout;
}

function compose(m: LocalManifest, args: string[], inherited = process.env) {
  return execute("docker", ["compose", "--env-file", resolve(localDirectory, "compose.env"), "-p", m.project,
    "-f", composeFile, ...args], undefined, composeEnvironment(m, inherited));
}

function checkCompose(m: LocalManifest, inherited = process.env) {
  validateComposeConfig(JSON.parse(compose(m, ["config", "--format", "json"], inherited)), m);
}

function save(m: LocalManifest) {
  validateManifest(m);
  writePrivateFile(manifestPath, JSON.stringify(m, null, 2));
}

function removeOperationalFiles() {
  if (localDirectory !== databaseDirectory) throw new Error("Local cleanup path mismatch");
  for (const file of ["bootstrap-password", "compose.env", "manifest.json"]) {
    const path = resolve(localDirectory, file); assertPrivatePath(path); unlinkSync(path);
  }
  rmdirSync(localDirectory);
}

function localDocker(m?: LocalManifest) {
  if (process.env.DOCKER_HOST) throw new Error("Ambient DOCKER_HOST is not allowed for this local setup");
  const dockerContext = execute("docker", ["context", "show"]).trim();
  const dockerEndpoint = JSON.parse(execute("docker", ["context", "inspect", dockerContext,
    "--format", "{{json .Endpoints.docker.Host}}"]));
  if (!/^[a-zA-Z0-9_.-]+$/.test(dockerContext) ||
    !["npipe:////./pipe/dockerDesktopLinuxEngine", "npipe:////./pipe/docker_engine", "unix:///var/run/docker.sock"].includes(dockerEndpoint) ||
    (m && (dockerContext !== m.dockerContext || dockerEndpoint !== m.dockerEndpoint))) {
    throw new Error("Refusing a changed or nonlocal Docker context");
  }
  return { dockerContext, dockerEndpoint: dockerEndpoint as string };
}

// PostgreSQL cannot parameterize identifiers in CREATE/DROP/GRANT statements.
// Every identifier originates in the validated manifest, never external input.
function identifier(value: string) {
  if (!/^usp_m1b_[a-z0-9_]+$/.test(value)) throw new Error("Invalid local SQL identifier");
  return `"${value}"`;
}

function sqlLiteral(value: string) {
  // Used only for generated owner/database names and random hexadecimal passwords.
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Invalid local SQL literal");
  return `'${value}'`;
}

function psql(m: LocalManifest, database: string, sql: string) {
  return execute("docker", ["exec", "-i", m.container, "psql", "--no-psqlrc", "--username", bootstrapRole,
    "--dbname", database, "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], sql);
}

function verifyResources(m: LocalManifest) {
  validateManifest(m);
  localDocker(m);
  const containers = JSON.parse(execute("docker", ["inspect", "--type", "container", m.container])) as {
    Id: string; Config: { Image: string; Labels: Record<string, string> };
    Mounts: { Type: string; Name: string; Destination: string }[];
    HostConfig: { PortBindings: Record<string, { HostIp: string; HostPort: string }[]> };
  }[];
  const c = containers[0];
  const binding = c?.HostConfig.PortBindings["5432/tcp"];
  if (containers.length !== 1 || c.Config.Image !== image ||
    c.Config.Labels["edu.usp.m1b.owner"] !== m.owner ||
    c.Config.Labels["com.docker.compose.project"] !== m.project ||
    c.Config.Labels["com.docker.compose.service"] !== "postgres" ||
    (m.containerId && c.Id !== m.containerId) ||
    binding?.length !== 1 || binding[0].HostIp !== "127.0.0.1" || binding[0].HostPort !== String(m.port) ||
    !c.Mounts.some((mount) => mount.Type === "volume" && mount.Name === m.volume && mount.Destination === "/var/lib/postgresql")) {
    throw new Error("Container ownership or target mismatch");
  }
  const [volume] = JSON.parse(execute("docker", ["volume", "inspect", m.volume])) as { Labels: Record<string, string> }[];
  if (volume.Labels["edu.usp.m1b.owner"] !== m.owner || volume.Labels["com.docker.compose.project"] !== m.project) {
    throw new Error("Volume ownership mismatch");
  }
  return c.Id;
}

function checkNoExistingResources(m: LocalManifest) {
  const containers = execute("docker", ["ps", "-a", "--format", '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "edu.usp.m1b.owner"}}']);
  const volumes = execute("docker", ["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "edu.usp.m1b.owner"}}']);
  assertNoResourceCollisions(m, containers, volumes);
}

function initializeRoles(m: LocalManifest) {
  const migration = identifier(m.migrationRole);
  const runtime = identifier(m.runtimeRole);
  psql(m, "postgres", `CREATE ROLE ${migration} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
    PASSWORD ${sqlLiteral(m.migrationPassword)};
    CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
    PASSWORD ${sqlLiteral(m.runtimePassword)};
    REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;`);
}

async function createDatabase(m: LocalManifest, record: DatabaseRecord) {
  verifyResources(m);
  // Refuse any existing name; a partial setup is never silently adopted or reset.
  if (psql(m, "postgres", `SELECT datname FROM pg_database WHERE datname = ${sqlLiteral(record.name)};`).trim()) {
    throw new Error("Refusing to adopt an existing database");
  }
  psql(m, "postgres", `CREATE DATABASE ${identifier(record.name)} OWNER ${identifier(bootstrapRole)}
    TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST';
    REVOKE ALL ON DATABASE ${identifier(record.name)} FROM PUBLIC;
    GRANT CONNECT ON DATABASE ${identifier(record.name)} TO ${identifier(m.migrationRole)}, ${identifier(m.runtimeRole)};`);
  psql(m, record.name, `REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE, CREATE ON SCHEMA public TO ${identifier(m.migrationRole)};
    GRANT USAGE ON SCHEMA public TO ${identifier(m.runtimeRole)};
    CREATE SCHEMA __m1b;
    REVOKE ALL ON SCHEMA __m1b FROM PUBLIC;
    CREATE TABLE __m1b.guard (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), owner text NOT NULL, database text NOT NULL);
    INSERT INTO __m1b.guard (owner, database) VALUES (${sqlLiteral(m.owner)}, ${sqlLiteral(record.name)});
    GRANT USAGE ON SCHEMA __m1b TO ${identifier(m.migrationRole)}, ${identifier(m.runtimeRole)};
    GRANT SELECT ON __m1b.guard TO ${identifier(m.migrationRole)}, ${identifier(m.runtimeRole)};`);
  record.ready = true;
  save(m);
  await assertDatabaseIdentity(databaseUrl(m, record.name, "migration"), m, "migration");
}

async function migrate(m: LocalManifest, name: string) {
  verifyResources(m);
  const url = databaseUrl(m, name, "migration");
  await assertDatabaseIdentity(url, m, "migration");
  execute(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], undefined,
    { ...process.env, M1B_MIGRATION_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" });
  // Runtime can manipulate only these records, never the marker or migration history.
  psql(m, name, `GRANT EXECUTE ON FUNCTION public.usp_email_lower_v17(text) TO ${identifier(m.runtimeRole)};
    GRANT SELECT ON "User", "Profile", "EmailOwnershipChallenge" TO ${identifier(m.runtimeRole)};
    GRANT INSERT (id, email, "emailKey", "createdAt", "updatedAt") ON "User" TO ${identifier(m.runtimeRole)};
    GRANT INSERT ("userId", "displayName", "createdAt", "updatedAt") ON "Profile" TO ${identifier(m.runtimeRole)};
    GRANT INSERT (id, "userId", "emailKey", "tokenDigest", "createdAt", "expiresAt") ON "EmailOwnershipChallenge" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE ("emailVerifiedAt", "updatedAt") ON "User" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE ("displayName", "updatedAt") ON "Profile" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE ("consumedAt", "revokedAt") ON "EmailOwnershipChallenge" TO ${identifier(m.runtimeRole)};
    GRANT INSERT ("browserDigest") ON "EmailOwnershipChallenge" TO ${identifier(m.runtimeRole)};
    GRANT SELECT ON "Session", "IdentityRateLimit" TO ${identifier(m.runtimeRole)};
    GRANT INSERT (id, "userId", "tokenDigest", "createdAt", "expiresAt") ON "Session" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE ("revokedAt") ON "Session" TO ${identifier(m.runtimeRole)};
    GRANT INSERT ("keyDigest", "startedAt", hits) ON "IdentityRateLimit" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE ("startedAt", hits) ON "IdentityRateLimit" TO ${identifier(m.runtimeRole)};
    GRANT SELECT ON "Community", "CommunityMembership" TO ${identifier(m.runtimeRole)};
    GRANT INSERT (id, "ownerId", name, description, visibility, "createdAt") ON "Community" TO ${identifier(m.runtimeRole)};
    GRANT INSERT ("communityId", "userId", status, "createdAt") ON "CommunityMembership" TO ${identifier(m.runtimeRole)};
    GRANT UPDATE (status) ON "CommunityMembership" TO ${identifier(m.runtimeRole)};
    GRANT DELETE ON "CommunityMembership" TO ${identifier(m.runtimeRole)};`);
  console.log(`Reviewed migration history applied: ${name}`);
}

async function removeTestDatabase(m: LocalManifest, record: DatabaseRecord) {
  verifyResources(m);
  if (record.kind !== "test" || !m.databases.includes(record)) throw new Error("Refusing non-test database cleanup");
  await assertDatabaseIdentity(databaseUrl(m, record.name, "migration"), m, "migration");
  // No FORCE: lingering connections cause a failure, not destructive termination.
  psql(m, "postgres", `DROP DATABASE ${identifier(record.name)};`);
  m.databases = m.databases.filter((d) => d !== record);
  save(m);
  console.log(`Removed owned disposable database: ${record.name}`);
}

async function reviewMigration(m: LocalManifest) {
  verifyResources(m);
  if (!m.databases.some((record) => record.kind === "development" && record.ready)) throw new Error("A ready owned development database is required for migration review");
  // Compare the entire replayed history, including additive migrations, against
  // the current Prisma schema. Only a newly owned disposable DB is mutated.
  // No shadow/reset workflow or hand-maintained final-schema snapshot.
  const record: DatabaseRecord = { name: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false };
  m.databases.push(record); save(m);
  const output = resolve(".cache/m2-reviewed-generated.sql");
  if (existsSync(output)) unlinkSync(output); // A stale artifact cannot establish successful generation.
  try {
    await createDatabase(m, record);
    await migrate(m, record.name);
    const url = databaseUrl(m, record.name, "migration");
    await assertDatabaseIdentity(url, m, "migration");
    execute(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource",
      "--to-schema", "prisma/schema.prisma", "--script", "--output", output], undefined,
      { ...process.env, M1B_MIGRATION_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" });
    if (!existsSync(output)) throw new Error("Migration generation produced no artifact; review failed");
    if (readFileSync(output, "utf8").replace(/^--.*$/gm, "").trim()) {
      throw new Error("Current Prisma schema differs from replayed migration history; inspect SQL before proceeding");
    }
    console.log("Complete migration history matches current Prisma tables/indexes/foreign keys; custom SQL checks reviewed separately");
  } finally { if (record.ready) await removeTestDatabase(m, record); }
}

async function setup() {
  if (existsSync(manifestPath)) throw new Error("Local manifest already exists; inspect status instead of adopting/resetting resources");
  const docker = localDocker();
  execute("docker", ["info", "--format", "{{.ServerVersion}}"]);
  execute("docker", ["compose", "version"]);
  const owner = isolation?.owner ?? randomBytes(6).toString("hex");
  const project = `usp-m1b-${owner}`;
  const prefix = `usp_m1b_${owner}`;
  const m: LocalManifest = {
    version: 1, root: resolve("."), owner, project, container: `${project}-postgres`, containerId: null,
    ...docker,
    volume: `${project}-data`, port: configuredPostgresPort(localConfiguration, isolation), image,
    migrationRole: `${prefix}_migrate`, migrationPassword: randomBytes(32).toString("hex"),
    runtimeRole: `${prefix}_runtime`, runtimePassword: randomBytes(32).toString("hex"),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: false }],
  };
  validateManifest(m);
  await ensurePostgresPortAvailable(m.port);
  checkNoExistingResources(m);
  assertPrivatePath(localDirectory, true);
  writePrivateFile(manifestPath, JSON.stringify(m, null, 2), true);
  writePrivateFile(resolve(localDirectory, "bootstrap-password"), randomBytes(32).toString("hex"), true);
  writePrivateFile(resolve(localDirectory, "compose.env"),
    `M1B_OWNER=${m.owner}\nM1B_CONTAINER=${m.container}\nM1B_VOLUME=${m.volume}\nM1B_PORT=${m.port}\n`, true);
  try {
    checkCompose(m);
    // Check the same authoritative names again immediately before provisioning.
    checkNoExistingResources(m);
  } catch (error) {
    // Preflight performs no Docker mutation. Remove only this setup's files.
    removeOperationalFiles();
    throw error;
  }
  compose(m, ["up", "-d", "--wait", "--wait-timeout", "90", "postgres"]);
  m.containerId = verifyResources(m);
  save(m);
  initializeRoles(m);
  await createDatabase(m, m.databases[0]);
  console.log(`Dedicated PostgreSQL ready: ${m.container}; loopback port ${m.port}; ${m.databases[0].name}`);
}

async function test(m: LocalManifest) {
  verifyResources(m);
  // Two complete-history databases and populated Unicode/M2/M3 forward-upgrade fixtures.
  const records: DatabaseRecord[] = [0, 1, 2, 3, 4].map(() => ({
    name: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false,
  }));
  m.databases.push(...records);
  save(m);
  try {
    for (const [index, record] of records.entries()) {
      await createDatabase(m, record);
      if (index < 2) await migrate(m, record.name);
    }
    const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.database.config.mjs"], {
      env: { ...process.env, M1B_TEST_DATABASE: records[0].name, M1B_REPLAY_DATABASE: records[1].name,
        M1B_UPGRADE_DATABASE: records[2].name, M2_UPGRADE_DATABASE: records[3].name, M3_UPGRADE_DATABASE: records[4].name },
      encoding: "utf8", windowsHide: true,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.error || result.status !== 0) throw new Error("Disposable PostgreSQL tests failed");
    // Reapply to the populated first DB, and prove its synthetic records survive.
    const url = databaseUrl(m, records[0].name, "runtime");
    await assertDatabaseIdentity(url, m, "runtime");
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      const before = await client.query('SELECT id, email, "emailKey" FROM "User" ORDER BY id');
      const communityBefore = await client.query('SELECT * FROM "Community" ORDER BY id');
      const membershipBefore = await client.query('SELECT * FROM "CommunityMembership" ORDER BY "communityId", "userId"');
      await migrate(m, records[0].name);
      const after = await client.query('SELECT id, email, "emailKey" FROM "User" ORDER BY id');
      const communityAfter = await client.query('SELECT * FROM "Community" ORDER BY id');
      const membershipAfter = await client.query('SELECT * FROM "CommunityMembership" ORDER BY "communityId", "userId"');
      if (!before.rows.length || !communityBefore.rows.length || !membershipBefore.rows.length ||
          JSON.stringify([before.rows, communityBefore.rows, membershipBefore.rows]) !==
          JSON.stringify([after.rows, communityAfter.rows, membershipAfter.rows])) {
        throw new Error("Migration reapplication changed synthetic data");
      }
      console.log("Migration reapplication preserved populated user, community and membership records");
    } finally { await client.end(); }
  } finally {
    for (const record of records) {
      if (record.ready) await removeTestDatabase(m, record);
    }
  }
}

async function identityBrowser(m: LocalManifest) {
  verifyResources(m);
  const controlPath = browserControlPath;
  if (existsSync(controlPath)) throw new Error("Existing identity browser control file requires inspection; not overwritten");
  const record: DatabaseRecord = { name: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false };
  m.databases.push(record); save(m);
  try {
    await createDatabase(m, record);
    await migrate(m, record.name);
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
      env: { ...process.env, M2_IDENTITY_E2E: "1", M2_BROWSER_DATABASE: record.name, USP_MANUAL_IDENTITY: "0" },
      encoding: "utf8", windowsHide: true,
    });
    process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
    if (result.error || result.status !== 0) throw new Error("Identity browser tests failed");
  } finally {
    if (existsSync(controlPath)) {
      removeBrowserControl(controlPath, record.name);
    }
    if (record.ready) await removeTestDatabase(m, record);
  }
}

function removeBrowserControl(path: string, name: string) {
  const control = parseOperationalJson(readPrivateFile(path), "CONTROL_JSON") as { databaseName: string };
  if (path !== browserControlPath || control.databaseName !== name) throw new Error("Refusing another runner's control-file cleanup");
  unlinkSync(path);
}

async function cleanup(m: LocalManifest) {
  assertLocalPath(manualSessionPath);
  if (existsSync(manualSessionPath)) throw new Error("Clean the retained manual session separately before whole-setup cleanup");
  verifyResources(m);
  for (const record of m.databases) {
    if (!record.ready) throw new Error("Incomplete database setup requires inspection; automatic cleanup refused");
    await assertDatabaseIdentity(databaseUrl(m, record.name, "migration"), m, "migration");
  }
  execute("docker", ["stop", m.container]);
  execute("docker", ["rm", m.container]);
  execute("docker", ["volume", "rm", m.volume]);
  // Remove only known operational files beneath the checked project-local directory.
  removeOperationalFiles();
  console.log(`Removed only owned container ${m.container} and volume ${m.volume}; Docker Desktop remains running`);
}

async function guardCheck(m: LocalManifest) {
  verifyResources(m);
  // Read-only regression: these synthetic names must never become mount targets.
  checkCompose(m, { ...process.env, M1B_OWNER: "synthetic-unowned-owner",
    M1B_CONTAINER: "synthetic-unowned-container", M1B_VOLUME: "synthetic-unowned-volume", M1B_PORT: "65432",
    m1b_volume: "synthetic-lowercase-override", COMPOSE_PROJECT_NAME: "synthetic-unowned-project",
    COMPOSE_FILE: "synthetic-unowned.yaml", COMPOSE_PROFILES: "synthetic-profile" });
  console.log("Read-only Compose config ignored inherited synthetic overrides and matched owned resources");
  const record: DatabaseRecord = {
    name: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false,
  };
  m.databases.push(record);
  save(m);
  await createDatabase(m, record);
  const url = databaseUrl(m, record.name, "runtime");
  const restore = () => psql(m, record.name, `DELETE FROM __m1b.guard;
    INSERT INTO __m1b.guard (owner, database) VALUES (${sqlLiteral(m.owner)}, ${sqlLiteral(record.name)});`);
  const expectRejection = async () => {
    let rejected = false;
    try { await assertDatabaseIdentity(url, m, "runtime"); } catch { rejected = true; }
    if (!rejected) throw new Error("Identity guard accepted an invalid marker");
  };
  try {
    psql(m, record.name, "UPDATE __m1b.guard SET owner = 'wrong';");
    await expectRejection();
    restore();
    psql(m, record.name, "DELETE FROM __m1b.guard;");
    await expectRejection();
    restore();
    await assertDatabaseIdentity(url, m, "runtime");
    const runtime = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await runtime.connect();
    try {
      for (const sql of ["CREATE TABLE public.forbidden (id integer)", "UPDATE __m1b.guard SET owner = 'wrong'"]) {
        let denied = false;
        try { await runtime.query(sql); }
        catch (error) { denied = !!error && typeof error === "object" && "code" in error && error.code === "42501"; }
        if (!denied) throw new Error("Runtime role exceeded local permissions");
      }
    } finally { await runtime.end(); }
    console.log("Real database guards rejected mismatched/missing markers; runtime DDL and marker writes were denied");
  } finally {
    // Restore only this run's marker so exact, ownership-checked cleanup remains possible.
    restore();
    await removeTestDatabase(m, record);
  }
}

async function manualPrepare(m: LocalManifest) {
  if (existsSync(manualSessionPath) || existsSync(manualControlPath) || existsSync(browserControlPath)) {
    throw new Error("Existing manual/browser state requires inspection; preparation refused");
  }
  verifyResources(m);
  await reviewMigration(m);
  const session = newManualSession(m);
  writeManualSession(session, m, true);
  const record: DatabaseRecord = { name: session.databaseName, kind: "test", ready: false };
  await prepareSession(session, {
    save: (value) => writeManualSession(value, m),
    register: () => { m.databases.push(record); save(m); },
    create: () => createDatabase(m, record),
    migrate: () => migrate(m, record.name),
    verify: () => assertDatabaseIdentity(databaseUrl(m, record.name, "runtime"), m, "runtime"),
  });
  console.log("Manual QA prepared; the owned test database is retained until manual:cleanup");
}

async function manualStart(m: LocalManifest, lease: LifecycleLease) {
  let session = readManualSession(m);
  authorizeManualOperation(session, m, "start");
  if (existsSync(manualControlPath) || existsSync(browserControlPath)) throw new Error("Existing control state requires inspection");
  verifyResources(m);
  await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
  if (!existsSync(resolve(".next/BUILD_ID"))) throw new Error("Build the application before manual:start");
  await ensurePortFree(3100);
  session = beginManualRun(session, m, lease);
  writeManualSession(session, m);
  const child = spawn(process.execPath, ["tools/identity/local-server.mts"], {
    env: { ...process.env, M2_IDENTITY_E2E: "1", M2_BROWSER_DATABASE: session.databaseName,
      USP_MANUAL_IDENTITY: "1", USP_MANUAL_SESSION_ID: session.sessionId, USP_MANUAL_RUN_ID: session.runId! },
    windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  await new Promise<void>((accept, reject) => {
    let acknowledged = false, stopRequested = false, failed = false;
    let ownedControl: string | null = null;
    let shutdownWarning: ReturnType<typeof setTimeout> | undefined;
    const input = createInterface({ input: process.stdin });
    const persist = (value: ManualSession) => {
      session = value;
      try { lease.assertHeld(); writeManualSession(session, m); } catch { failed = true; }
    };
    const stop = () => {
      if (stopRequested) return;
      stopRequested = true;
      persist({ ...session, phase: "stopping" });
      if (child.connected) child.send({ type: "manual-stop", runId: session.runId }, (error) => { if (error) failed = true; });
      shutdownWarning = setTimeout(() => {
        failed = true;
        console.error("Shutdown not confirmed; keeping the lifecycle lock. Inspect this owned child; no process was killed");
      }, 20000);
    };
    const startupDeadline = setTimeout(() => { failed = true; stop(); }, 60000);
    input.on("line", (line) => { if (line.trim() === "stop") stop(); });
    input.once("close", stop);
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    child.once("error", () => { failed = true; });
    child.on("message", (message: unknown) => {
      if (!message || typeof message !== "object" || !("runId" in message) || message.runId !== session.runId || !("type" in message)) return;
      if (message.type === "manual-ready" && !stopRequested && session.phase === "starting") {
        try {
          checkManualFiles();
          ownedControl = readPrivateFile(manualControlPath);
          const control = validateManualControl(parseOperationalJson(ownedControl, "CONTROL_JSON"), session);
          if (!session.execution) throw new Error("Server incarnation missing");
          persist({ ...session, phase: "running", execution: { ...session.execution, controlPort: control.port } });
          if (failed) { stop(); return; }
          clearTimeout(startupDeadline);
          console.log("Manual QA ready at http://127.0.0.1:3100. Type stop + Enter (or Ctrl+C); data will be retained");
        } catch { failed = true; stop(); }
      } else if (message.type === "manual-stopped") acknowledged = true;
    });
    child.once("close", (code) => {
      clearTimeout(startupDeadline); clearTimeout(shutdownWarning);
      process.off("SIGINT", stop); process.off("SIGTERM", stop);
      input.removeListener("close", stop); input.close();
      try {
        persist(finishManualRun(session, ownedControl, { requested: stopRequested, acknowledged, failed, code }, {
          assertLease: () => lease.assertHeld(),
          readSession: () => readManualSession(m),
          read: () => existsSync(manualControlPath) ? readPrivateFile(manualControlPath) : null,
          remove: () => { assertPrivatePath(manualControlPath); unlinkSync(manualControlPath); },
        }));
      } catch { failed = true; persist(stoppedSession(session, false, code)); }
      if (session.phase !== "stopped" || failed) reject(new Error("Manual server interrupted; retained state requires inspection"));
      else { console.log("Manual server stopped; test data retained"); accept(); }
    });
    if (child.pid) {
      persist({ ...session, pid: child.pid });
      try {
        const server = inspectProcesses([child.pid]).processes.find((p) => p.pid === child.pid);
        if (!server) throw new Error("Child identity unavailable");
        persist({ ...session, execution: { server, supervisor: lease.lock!.process, leaseNonce: lease.lock!.nonce, controlPort: null } });
        if (!failed && child.connected) child.send({ type: "manual-initialize", runId: session.runId }, (error) => { if (error) { failed = true; stop(); } });
        else failed = true;
      } catch { failed = true; }
    } else failed = true;
    if (failed) stop();
  });
}

async function manualStatus(m: LocalManifest) {
  const session = readManualSession(m);
  console.log(`Manual QA recorded state: ${session.phase}`);
  console.log("State is a lifecycle record, not an HTTP health assertion. Postman must verify request/confirm/profile");
  verifyResources(m);
  const record = m.databases.find((item) => item.name === session.databaseName && item.kind === "test");
  const ready = !!record?.ready;
  if (ready) await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
  console.log(`Owned test target: ${ready ? "identity verified" : "incomplete/unregistered"}`);
  if (session.phase === "running") {
    validateManualControl(parseOperationalJson(readPrivateFile(manualControlPath), "CONTROL_JSON"), session);
    console.log("Matching control metadata present; base URL http://127.0.0.1:3100");
  }
}

async function manualToken(m: LocalManifest, email: string) {
  const session = readManualSession(m);
  authorizeManualOperation(session, m, "token");
  verifyResources(m);
  await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
  await deliverManualToken(async () => {
    checkManualFiles();
    const current = readManualSession(m);
    authorizeManualOperation(current, m, "token");
    if (current.sessionId !== session.sessionId || current.runId !== session.runId) throw new Error("Manual session changed");
    const control = validateManualControl(parseOperationalJson(readPrivateFile(manualControlPath), "CONTROL_JSON"), current);
    const token = await requestManualToken(control, email);
    const after = readManualSession(m);
    authorizeManualOperation(after, m, "token");
    if (after.sessionId !== session.sessionId || after.runId !== session.runId) throw new Error("Manual session changed during retrieval");
    return token;
  }, () => console.log("Synthetic token copied locally for 30 seconds; paste into Postman. Keep this helper open until it finishes"));
  console.log("Clipboard delivery finished; no token was printed or written to a file");
}

async function manualCleanup(m: LocalManifest) {
  const session = readManualSession(m);
  await cleanupSession(session, m, {
    controlExists: () => existsSync(manualControlPath) || existsSync(browserControlPath),
    verify: async () => {
      verifyResources(m);
      await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "migration"), m, "migration");
    },
    save: (value) => writeManualSession(value, m),
    drop: (record) => removeTestDatabase(m, record),
    forget: () => {
      const current = readManualSession(m);
      if (current.sessionId !== session.sessionId || current.phase !== "cleaning") throw new Error("Manual cleanup identity changed");
      unlinkSync(manualSessionPath);
    },
  });
  console.log("Only the manual test database and its session record were removed; local development resources were preserved");
}

let releaseLock: LifecycleLease | undefined;
try {
  isolation = readIsolationProfile();
  localConfiguration = readLocalDatabaseConfig();
  configuredPostgresPort(localConfiguration, isolation);
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { name: string };
  if (pkg.name !== "university-social-platform" || !existsSync(composeFile)) throw new Error("Run from this project root");
  const command = process.argv[2];
  const commands = ["setup", "migrate", "review", "test", "identity-browser", "cleanup", "guard-check", "status",
    "manual-prepare", "manual-start", "manual-status", "manual-token", "manual-cleanup", "manual-recover"];
  if (!commands.includes(command)) throw new Error("Unknown local database command");
  if (command === "manual-token") {
    if (process.argv.length !== 5 || process.argv[3] !== "--email") throw new Error("Use manual:token -- --email <synthetic-address>");
    syntheticManualEmail(process.argv[4]);
  } else if (process.argv.length !== 3) throw new Error("Use exactly one local database command");
  assertLocalPath(manifestPath); // Surface actionable legacy refusal before any lease/credential work.
  if (!["status", "manual-status", "manual-token", "manual-recover"].includes(command)) releaseLock = await acquireLifecycleLock(command);
  if (command === "manual-recover") {
    await recoverManualQa(async (m, session) => {
      verifyResources(m);
      await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
    });
    console.log("Manual QA recovered after a proven interruption; existing test data preserved. Run manual:start separately");
  } else if (command.startsWith("manual-")) {
    assertLocalPath(manualSessionPath);
    if (command === "manual-status" && !existsSync(manualSessionPath)) {
      assertLocalPath(manualControlPath); assertLocalPath(lifecycleLockPath);
      if (existsSync(manualControlPath)) throw new Error("Orphaned manual control metadata requires inspection");
      console.log(`No retained manual QA session; lifecycle lock ${existsSync(lifecycleLockPath) ? "present (inspect before changes)" : "absent"}`);
    } else {
      checkManualFiles(command === "manual-prepare");
      const m = readManifest();
      if (command === "manual-prepare") await manualPrepare(m);
      else if (command === "manual-start") await manualStart(m, releaseLock!);
      else if (command === "manual-status") await manualStatus(m);
      else if (command === "manual-token") await manualToken(m, process.argv[4]);
      else await manualCleanup(m);
    }
  }
  else if (command === "setup") await setup();
  else {
    const m = readManifest();
    if (command === "migrate") {
      await reviewMigration(m);
      await migrate(m, m.databases.find((d) => d.kind === "development")!.name);
    }
    else if (command === "review") await reviewMigration(m);
    else if (command === "test") {
      await reviewMigration(m);
      await test(m);
    }
    else if (command === "identity-browser") { await reviewMigration(m); await identityBrowser(m); }
    else if (command === "cleanup") await cleanup(m);
    else if (command === "guard-check") await guardCheck(m);
    else if (command === "status") {
      verifyResources(m);
      for (const record of m.databases) await assertDatabaseIdentity(databaseUrl(m, record.name, "runtime"), m, "runtime");
      console.log(`Owned local PostgreSQL: ${m.container}; port ${m.port}; databases: ${m.databases.map((d) => d.name).join(", ")}`);
    } else throw new Error("Unknown local database command");
  }
} catch (error) {
  console.error(process.argv[2] === "manual-recover"
    ? "Manual recovery refused (" + (error instanceof RecoveryRefusal ? error.code : "IO") + "); retained state requires inspection"
    : formatOperationalError(error, process.argv[2]?.startsWith("manual-")));
  process.exitCode = 1;
} finally {
  try { await releaseLock?.(); }
  catch { console.error("Lifecycle lock release refused; inspect local state"); process.exitCode = 1; }
}
