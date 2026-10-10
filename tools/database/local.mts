import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { composeEnvironment, validateComposeConfig } from "./compose.ts";
import {
  assertDatabaseIdentity, databaseUrl, image, manifestPath, readManifest, validateManifest,
  type LocalManifest, type DatabaseRecord,
} from "./targets.ts";

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
  writeFileSync(manifestPath, JSON.stringify(m, null, 2), { mode: 0o600 });
}

function removeOperationalFiles() {
  if (localDirectory !== resolve(".cache/m1b")) throw new Error("Local cleanup path mismatch");
  for (const file of ["bootstrap-password", "compose.env", "manifest.json"]) unlinkSync(resolve(localDirectory, file));
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

async function ensurePortFree(port: number) {
  await new Promise<void>((accept, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error("Project-local PostgreSQL port is occupied")));
    server.listen(port, "127.0.0.1", () => server.close(() => accept()));
  });
}

function checkNoExistingResources(m: LocalManifest) {
  const containers = execute("docker", ["ps", "-a", "--format", "{{.Names}}\t{{.Label \"com.docker.compose.project\"}}"]);
  const volumes = execute("docker", ["volume", "ls", "--format", "{{.Name}}\t{{.Label \"com.docker.compose.project\"}}"]);
  if (containers.split("\n").some((line) => line.split("\t")[0] === m.container || line.split("\t")[1] === m.project) ||
    volumes.split("\n").some((line) => line.split("\t")[0] === m.volume || line.split("\t")[1] === m.project)) {
    throw new Error("Refusing to adopt pre-existing local resources");
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
  const owner = randomBytes(6).toString("hex");
  const project = `usp-m1b-${owner}`;
  const prefix = `usp_m1b_${owner}`;
  const m: LocalManifest = {
    version: 1, root: resolve("."), owner, project, container: `${project}-postgres`, containerId: null,
    ...docker,
    volume: `${project}-data`, port: 55432, image,
    migrationRole: `${prefix}_migrate`, migrationPassword: randomBytes(32).toString("hex"),
    runtimeRole: `${prefix}_runtime`, runtimePassword: randomBytes(32).toString("hex"),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: false }],
  };
  validateManifest(m);
  await ensurePortFree(m.port);
  checkNoExistingResources(m);
  mkdirSync(localDirectory, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(m, null, 2), { flag: "wx", mode: 0o600 });
  writeFileSync(resolve(localDirectory, "bootstrap-password"), randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  writeFileSync(resolve(localDirectory, "compose.env"),
    `M1B_OWNER=${m.owner}\nM1B_CONTAINER=${m.container}\nM1B_VOLUME=${m.volume}\nM1B_PORT=${m.port}\n`, { flag: "wx", mode: 0o600 });
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
  const controlPath = resolve(".cache/m2-browser.json");
  if (existsSync(controlPath)) throw new Error("Existing identity browser control file requires inspection; not overwritten");
  const record: DatabaseRecord = { name: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`, kind: "test", ready: false };
  m.databases.push(record); save(m);
  try {
    await createDatabase(m, record);
    await migrate(m, record.name);
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
      env: { ...process.env, M2_IDENTITY_E2E: "1", M2_BROWSER_DATABASE: record.name },
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
  const control = JSON.parse(readFileSync(path, "utf8")) as { databaseName: string };
  if (path !== resolve(".cache/m2-browser.json") || control.databaseName !== name) throw new Error("Refusing another runner's control-file cleanup");
  unlinkSync(path);
}

async function cleanup(m: LocalManifest) {
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

try {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { name: string };
  if (pkg.name !== "university-social-platform" || !existsSync(composeFile)) throw new Error("Run from this project root");
  const command = process.argv[2];
  if (process.argv.length !== 3) throw new Error("Use exactly one local database command");
  if (command === "setup") await setup();
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
  // Only this module's safe errors are reported; provider errors are hidden at boundaries.
  console.error(error instanceof Error && !/postgres(?:ql)?:\/\/|password=/i.test(error.message) ? error.message : "Local database operation failed");
  process.exitCode = 1;
}
