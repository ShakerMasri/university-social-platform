import { manualPaths, manualHttpPort } from "./manual-paths.ts";
import { formatOperationalError, parseOperationalJson } from "./operational-errors.ts";
import { finishManualRun } from "./manual-shutdown.ts";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { composeEnvironment, validateComposeConfig } from "./manual-compose.ts";
import { ensurePortFree, ensurePostgresPortAvailable } from "./ports.ts";
import { readManualDatabaseConfig, configuredManualPort } from "./manual-config.ts";
import { assertDatabaseIdentity, databaseUrl, image, readManifest, validateManifest, type LocalManifest, type DatabaseRecord } from "./manual-targets.ts";
import { acquireLifecycleLock, assertLocalPath, authorizeManualOperation, beginManualRun, checkManualFiles, cleanupSession, newManualSession, prepareSession, readManualSession, stoppedSession, validateManualControl, writeManualSession, type ManualSession } from "./manual-session.ts";
import { type LifecycleLease } from "./lifecycle-lock.ts";
import { inspectProcesses } from "./windows-process.ts";
import { recoverManualQa, RecoveryRefusal } from "./manual-recovery.ts";
import { deliverManualToken, requestManualToken, syntheticManualEmail } from "../identity/manual-mailbox.ts";

import { assertPrivatePath, powershellPath, readPrivateFile, writePrivateFile } from "./runtime-files.ts";

import { assertNoResourceCollisions } from "./isolation.ts";
import { assertEmptyManualSetup, assertManualPortUnclaimed } from "./manual-resources.ts";

let localConfiguration: ReturnType<typeof readManualDatabaseConfig>;
let localDirectory: string;
const composeFile = resolve("compose.manual.yaml");
const bootstrapRole = "usp_qa_bootstrap";

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
  writePrivateFile(manualPaths.manifestPath, JSON.stringify(m, null, 2));
}

function removeOperationalFiles() {
  if (localDirectory !== manualPaths.databaseDirectory) throw new Error("Local cleanup path mismatch");
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
  if (!/^usp_qa_[a-z0-9_]+$/.test(value)) throw new Error("Invalid local SQL identifier");
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
    c.Config.Labels["edu.usp.qa.owner"] !== m.owner ||
    c.Config.Labels["com.docker.compose.project"] !== m.project ||
    c.Config.Labels["com.docker.compose.service"] !== "postgres" ||
    (m.containerId && c.Id !== m.containerId) ||
    binding?.length !== 1 || binding[0].HostIp !== "127.0.0.1" || binding[0].HostPort !== String(m.port) ||
    !c.Mounts.some((mount) => mount.Type === "volume" && mount.Name === m.volume && mount.Destination === "/var/lib/postgresql")) {
    throw new Error("Container ownership or target mismatch");
  }
  const [volume] = JSON.parse(execute("docker", ["volume", "inspect", m.volume])) as { Labels: Record<string, string> }[];
  if (volume.Labels["edu.usp.qa.owner"] !== m.owner || volume.Labels["com.docker.compose.project"] !== m.project) {
    throw new Error("Volume ownership mismatch");
  }
  return c.Id;
}

function checkNoExistingResources(m: LocalManifest) {
  const containers = execute("docker", ["ps", "-a", "--format", '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "edu.usp.qa.owner"}}']);
  const volumes = execute("docker", ["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "edu.usp.qa.owner"}}']);
  assertNoResourceCollisions(m, containers, volumes);
  assertManualPortUnclaimed(m.port, null);
  const ids = execute("docker", ["ps", "-a", "--no-trunc", "--format", "{{.ID}}"])
    .split(/\r?\n/).filter(Boolean);
  if (ids.length > 1000 || ids.some((id) => !/^[a-f0-9]{64}$/.test(id))) throw new Error("Port inventory unavailable");
  for (const id of ids) {
    const metadata = execute("docker", ["inspect", "--type", "container", "--format", "{{json .HostConfig.PortBindings}}", id]);
    if (metadata.length > 65536) throw new Error("Port inventory unavailable");
    assertManualPortUnclaimed(m.port, JSON.parse(metadata) as unknown);
  }
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
  execute(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.manual.config.ts"], undefined,
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
  const record: DatabaseRecord = { name: `usp_qa_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false };
  m.databases.push(record); save(m);
  const output = resolve(manualPaths.databaseDirectory, "reviewed.sql");
  assertLocalPath(output);
  if (existsSync(output)) unlinkSync(output); // A stale artifact cannot establish successful generation.
  try {
    await createDatabase(m, record);
    await migrate(m, record.name);
    const url = databaseUrl(m, record.name, "migration");
    await assertDatabaseIdentity(url, m, "migration");
    execute(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource",
      "--to-schema", "prisma/schema.prisma", "--script", "--output", output, "--config", "prisma.manual.config.ts"], undefined,
      { ...process.env, M1B_MIGRATION_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" });
    if (!existsSync(output)) throw new Error("Migration generation produced no artifact; review failed");
    if (readFileSync(output, "utf8").replace(/^--.*$/gm, "").trim()) {
      throw new Error("Current Prisma schema differs from replayed migration history; inspect SQL before proceeding");
    }
    console.log("Complete migration history matches current Prisma tables/indexes/foreign keys; custom SQL checks reviewed separately");
  } finally { if (record.ready) await removeTestDatabase(m, record); }
}

async function setup() {
  if (existsSync(manualPaths.manifestPath)) throw new Error("Local manifest already exists; inspect status instead of adopting/resetting resources");
  const docker = localDocker();
  execute("docker", ["info", "--format", "{{.ServerVersion}}"]);
  execute("docker", ["compose", "version"]);
  const owner = randomBytes(6).toString("hex");
  const project = `usp-qa-${owner}`;
  const prefix = `usp_qa_${owner}`;
  const m: LocalManifest = {
    version: 1, root: resolve("."), owner, project, container: `${project}-postgres`, containerId: null,
    ...docker,
    volume: `${project}-data`, port: configuredManualPort(localConfiguration), image,
    migrationRole: `${prefix}_migrate`, migrationPassword: randomBytes(32).toString("hex"),
    runtimeRole: `${prefix}_runtime`, runtimePassword: randomBytes(32).toString("hex"),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: false }],
  };
  validateManifest(m);
  await ensurePostgresPortAvailable(m.port);
  checkNoExistingResources(m);
  assertPrivatePath(localDirectory, true);
  assertEmptyManualSetup(readdirSync(localDirectory));
  writePrivateFile(manualPaths.manifestPath, JSON.stringify(m, null, 2), true);
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

async function manualPrepare(m: LocalManifest) {
  if (existsSync(manualPaths.manualSessionPath) || existsSync(manualPaths.manualControlPath) || existsSync(manualPaths.browserControlPath)) {
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
  if (existsSync(manualPaths.manualControlPath) || existsSync(manualPaths.browserControlPath)) throw new Error("Existing control state requires inspection");
  verifyResources(m);
  await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
  if (!existsSync(resolve(".next-manual/BUILD_ID"))) throw new Error("Run npm run manual:build before manual:start");
  await ensurePortFree(manualHttpPort);
  session = beginManualRun(session, m, lease);
  writeManualSession(session, m);
  const child = spawn(process.execPath, ["tools/identity/manual-server.mts"], {
    env: { ...process.env, M2_IDENTITY_E2E: "1", M2_BROWSER_DATABASE: session.databaseName,
      USP_MANUAL_IDENTITY: "1", USP_MANUAL_BUILD: "1", USP_MANUAL_SESSION_ID: session.sessionId, USP_MANUAL_RUN_ID: session.runId! },
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
          ownedControl = readPrivateFile(manualPaths.manualControlPath);
          const control = validateManualControl(parseOperationalJson(ownedControl, "CONTROL_JSON"), session);
          if (!session.execution) throw new Error("Server incarnation missing");
          persist({ ...session, phase: "running", execution: { ...session.execution, controlPort: control.port } });
          if (failed) { stop(); return; }
          clearTimeout(startupDeadline);
          console.log("Manual QA ready at http://127.0.0.1:3200. Type stop + Enter (or Ctrl+C); data will be retained");
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
          read: () => existsSync(manualPaths.manualControlPath) ? readPrivateFile(manualPaths.manualControlPath) : null,
          remove: () => { assertPrivatePath(manualPaths.manualControlPath); unlinkSync(manualPaths.manualControlPath); },
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
    validateManualControl(parseOperationalJson(readPrivateFile(manualPaths.manualControlPath), "CONTROL_JSON"), session);
    console.log("Matching control metadata present; base URL http://127.0.0.1:3200");
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
    const control = validateManualControl(parseOperationalJson(readPrivateFile(manualPaths.manualControlPath), "CONTROL_JSON"), current);
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
    controlExists: () => existsSync(manualPaths.manualControlPath) || existsSync(manualPaths.browserControlPath),
    verify: async () => {
      verifyResources(m);
      await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "migration"), m, "migration");
    },
    save: (value) => writeManualSession(value, m),
    drop: (record) => removeTestDatabase(m, record),
    forget: () => {
      const current = readManualSession(m);
      if (current.sessionId !== session.sessionId || current.phase !== "cleaning") throw new Error("Manual cleanup identity changed");
      unlinkSync(manualPaths.manualSessionPath);
    },
  });
  console.log("Only the manual test database and its session record were removed; local development resources were preserved");
}

let releaseLock: LifecycleLease | undefined;
try {
  powershellPath();
  localDirectory = manualPaths.databaseDirectory;
  localConfiguration = readManualDatabaseConfig();
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { name: string };
  if (pkg.name !== "university-social-platform" || !existsSync(composeFile)) throw new Error("Run from this project root");
  const command = process.argv[2];
  const commands = ["manual-prepare", "manual-start", "manual-status", "manual-token", "manual-cleanup", "manual-recover"];
  if (!commands.includes(command)) throw new Error("Unknown local database command");
  if (command === "manual-token") {
    if (process.argv.length !== 5 || process.argv[3] !== "--email") throw new Error("Use manual:token -- --email <synthetic-address>");
    syntheticManualEmail(process.argv[4]);
  } else if (process.argv.length !== 3) throw new Error("Use exactly one local database command");
  assertLocalPath(manualPaths.manifestPath); // Surface actionable legacy refusal before any lease/credential work.
  // Validate an existing namespace before creating any gate/lease. Never fill an
  // orphaned directory with new credentials alongside retained legacy evidence.
  if (existsSync(manualPaths.manifestPath)) readManifest();
  else if (existsSync(localDirectory)) {
    assertPrivatePath(localDirectory);
    assertEmptyManualSetup(readdirSync(localDirectory));
  }
  if (command === "manual-prepare" && [manualPaths.manualSessionPath, manualPaths.manualControlPath, manualPaths.browserControlPath].some(existsSync)) {
    throw new Error("Existing QA session/control requires inspection before preparation");
  }
  if (!["manual-status", "manual-token", "manual-recover"].includes(command)) releaseLock = await acquireLifecycleLock(command);
  if (command === "manual-recover") {
    await recoverManualQa(async (m, session) => {
      verifyResources(m);
      await assertDatabaseIdentity(databaseUrl(m, session.databaseName, "runtime"), m, "runtime");
    });
    console.log("Manual QA recovered after a proven interruption; existing test data preserved. Run manual:start separately");
  } else if (command.startsWith("manual-")) {
    assertLocalPath(manualPaths.manualSessionPath);
    if (command === "manual-status" && !existsSync(manualPaths.manualSessionPath)) {
      assertLocalPath(manualPaths.manualControlPath); assertLocalPath(manualPaths.lifecycleLockPath);
      if (existsSync(manualPaths.manualControlPath)) throw new Error("Orphaned manual control metadata requires inspection");
      console.log(`No retained manual QA session; lifecycle lock ${existsSync(manualPaths.lifecycleLockPath) ? "present (inspect before changes)" : "absent"}`);
    } else {
      if (command === "manual-prepare" && !existsSync(manualPaths.manifestPath)) await setup();
      checkManualFiles(command === "manual-prepare");
      const m = readManifest();
      if (command === "manual-prepare") await manualPrepare(m);
      else if (command === "manual-start") await manualStart(m, releaseLock!);
      else if (command === "manual-status") await manualStatus(m);
      else if (command === "manual-token") await manualToken(m, process.argv[4]);
      else await manualCleanup(m);
    }
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
