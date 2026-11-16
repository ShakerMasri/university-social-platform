import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { assertDatabaseIdentity, databaseUrl, readManifest, type DatabaseRecord, type LocalManifest } from "../database/targets.ts";
import { previewIsInactive } from "../identity/preview-control.ts";
import { manualDatabase, seedManualFixtures, type ManualFixtureTarget } from "./manual-fixtures.mts";

// Deliberately pinned to the reviewed M4 checkpoint. A different checkout/build
// requires a new review, not a silent rebuild or reuse of development data.
const checkpoint = { branch: "feat/m4-ai", head: "5311cc6033f84734f7b531228153fa223dc37ee1", buildId: "Oacv560kD6Qzgs8ajfTmc" };
const port = 3201;
const activePath = resolve(".cache/manual-qa.json");
const controlPath = resolve(".cache/m2-preview-check.json");
const phases = ["allocated", "creating", "migrating", "seeding", "starting", "running", "cleaning", "closed", "incomplete"] as const;
type Phase = typeof phases[number];
type ManualSession = ManualFixtureTarget & {
  version: 1; root: string; owner: string; containerId: string; buildId: string;
  launcherPid: number; childPid: number | null; controlDigest: string | null;
  phase: Phase; createdAt: string; lastFailure: string | null;
};
export type ManualDatabaseTools = {
  verify(): void;
  register(record: DatabaseRecord): void;
  create(record: DatabaseRecord, marker: string): Promise<void>;
  migrate(name: string): Promise<void>;
  remove(name: string): Promise<void>;
  connections(name?: string): number;
  portFree(port: number): Promise<void>;
};
class ManualSessionError extends Error {}
class ManualStopRequested extends ManualSessionError {}
const fail = (message: string): never => { throw new ManualSessionError(message); };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const directory = (session: ManualSession) => resolve(`.cache/manual-qa-${session.sessionId}`);
const stopPath = (session: ManualSession) => join(directory(session), "stop.requested");
const pause = () => new Promise<void>(accept => setTimeout(accept, 100));

function regularPath(path: string) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("Manual QA refuses symbolic-link resource paths");
}
function processAbsent(pid: number) {
  try { process.kill(pid, 0); return false; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    return fail("Process identity is uncertain; manual resources preserved");
  }
}
async function waitUntil(predicate: () => boolean | Promise<boolean>, timeout: number, message: string) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() >= deadline) fail(message); await pause(); }
}
async function listenerAbsent(host: string, targetPort: number) {
  await new Promise<void>((accept, reject) => {
    const socket = connect(targetPort, host);
    socket.setTimeout(2000, () => { socket.destroy(); reject(new ManualSessionError("Listener state is uncertain; resources preserved")); });
    socket.once("connect", () => { socket.destroy(); reject(new ManualSessionError("An application/control listener remains; resources preserved")); });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") accept();
      else reject(new ManualSessionError("Listener ownership is uncertain; resources preserved"));
    });
  });
}
function readSession(): ManualSession {
  regularPath(activePath);
  if (lstatSync(activePath).size > 16384) fail("Invalid manual session metadata");
  let session: ManualSession;
  try { session = JSON.parse(readFileSync(activePath, "utf8")) as ManualSession; }
  catch { return fail("Invalid manual session metadata; resources preserved"); }
  const manifest = readManifest();
  if (!session || typeof session !== "object" || session.version !== 1 || session.root !== realpathSync(".") || session.owner !== manifest.owner ||
      session.containerId !== manifest.containerId || !/^[a-f0-9]{12}$/.test(session.sessionId) ||
      !/^mqa_[a-f0-9]{32}$/.test(session.databaseMarker) || session.buildId !== checkpoint.buildId ||
      session.databaseName !== `usp_m1b_${manifest.owner}_test_${session.sessionId}` ||
      !Array.isArray(session.entryDatabaseNames) || session.entryDatabaseNames.includes(session.databaseName) ||
      !session.entryDatabaseNames.includes(`usp_m1b_${manifest.owner}_dev`) ||
      !session.entryDatabaseNames.every(name => manifest.databases.some(row => row.name === name && row.ready)) ||
      !Number.isInteger(session.launcherPid) || session.launcherPid < 1 ||
      (session.childPid !== null && (!Number.isInteger(session.childPid) || session.childPid < 1)) ||
      (session.controlDigest !== null && !/^[a-f0-9]{64}$/.test(session.controlDigest)) ||
      (session.lastFailure !== null && (typeof session.lastFailure !== "string" || session.lastFailure.length > 1024)) || !phases.includes(session.phase)) {
    fail("Manual session ownership metadata mismatch; no resources changed");
  }
  regularPath(directory(session));
  if (realpathSync(directory(session)) !== directory(session)) fail("Manual session directory mismatch");
  return session;
}
function persist(session: ManualSession) {
  const current = readSession();
  if (current.sessionId !== session.sessionId || current.databaseMarker !== session.databaseMarker) fail("Another session owns the active registration");
  const audit = join(directory(session), "session.json"); regularPath(audit);
  const value = JSON.stringify(session, null, 2);
  // Same-volume atomic replacement keeps concurrent status/stop readers from
  // observing truncated JSON. A failed replacement leaves diagnostic files.
  for (const target of [audit, activePath]) {
    const temporary = join(directory(session), `state-${randomBytes(6).toString("hex")}.json`);
    writeFileSync(temporary, value, { flag: "wx", mode: 0o600 });
    renameSync(temporary, target);
  }
}
function readControl(session: ManualSession) {
  regularPath(controlPath);
  if (lstatSync(controlPath).size > 2048) fail("Invalid manual control metadata size");
  const raw = readFileSync(controlPath, "utf8");
  let control: { databaseName: string; port: number; key: string; pid: number };
  try { control = JSON.parse(raw) as typeof control; }
  catch { return fail("Invalid manual control metadata; private contents omitted"); }
  if (!control || typeof control !== "object" || control.databaseName !== session.databaseName || control.pid !== session.childPid ||
      !Number.isInteger(control.port) || control.port < 1 || control.port > 65535 || typeof control.key !== "string" || !/^[a-f0-9]{64}$/.test(control.key) ||
      (session.controlDigest !== null && hash(raw) !== session.controlDigest)) fail("Manual application control ownership mismatch");
  return { raw, control };
}
async function controlCommand(session: ManualSession, operation: "status" | "stop") {
  const { control } = readControl(session);
  return new Promise<void>((accept, reject) => {
    const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, operation }) + "\n"));
    let output = "";
    socket.setTimeout(5000, () => { socket.destroy(); reject(new ManualSessionError("Manual control response timed out; no process killed")); });
    socket.on("data", chunk => {
      output += chunk.toString();
      if (output.length > 2048) { socket.destroy(); reject(new ManualSessionError("Invalid manual control response")); }
    });
    socket.on("error", () => reject(new ManualSessionError("Manual control unavailable; no process killed")));
    socket.on("end", () => {
      try {
        const reply = JSON.parse(output) as { databaseName?: unknown; stopped?: unknown };
        if (reply.databaseName !== session.databaseName || (operation === "stop" && reply.stopped !== true)) throw new Error("Mismatch");
        accept();
      } catch { reject(new ManualSessionError("Manual control target/response mismatch")); }
    });
  });
}

async function preflight(manifest: LocalManifest, tools: ManualDatabaseTools) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; engines: { node: string; npm: string } };
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    if (result.error || result.status !== 0) fail("Git preflight failed");
    return result.stdout;
  };
  if (pkg.name !== "university-social-platform" || process.versions.node !== pkg.engines.node ||
      process.env.npm_config_user_agent?.match(/^npm\/([\d.]+)/)?.[1] !== pkg.engines.npm) fail("Use qa:manual through the repository's required Node/npm versions");
  if (git(["branch", "--show-current"]).trim() !== checkpoint.branch || git(["rev-parse", "HEAD"]).trim() !== checkpoint.head ||
      readFileSync(".next/BUILD_ID", "utf8").trim() !== checkpoint.buildId) fail("Reviewed Git/build checkpoint mismatch; no automatic rebuild permitted");
  const allowed = new Set(["package.json", "tools/database/local.mts", "tests/e2e/ui-zoom.spec.ts", "tools/testing/manual-fixtures.mts", "tools/testing/manual-session.mts"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  if (status.split("\0").filter(Boolean).some(row => /[RC]/.test(row.slice(0, 2)) || !allowed.has(row.slice(3)))) fail("Unexpected working-tree changes; manual startup refused");
  if (Object.keys(process.env).some(key => /^(M1B_|M2_|USP_|PLAYWRIGHT_|PWDEBUG$|NODE_OPTIONS$|NODE_ENV$|DOCKER_HOST$|DOCKER_CONTEXT$)/i.test(key)) || process.env.CI) fail("Unexpected harness/environment overrides; use a clean interactive shell");
  if (realpathSync(".cache") !== resolve(".cache")) fail("Manual QA requires the checkout's own cache directory");
  if ([activePath, controlPath, resolve(".cache/m2-browser.json")].some(existsSync)) fail("A session/campaign registration already exists; inspect it rather than overwriting it");
  const development = manifest.databases.find(row => row.kind === "development" && row.ready);
  if (!development || (existsSync(".cache/m2-preview.json") && !await previewIsInactive(manifest, development))) fail("Interactive preview is active or uncertain");
  tools.verify();
  for (const candidate of [3000, 3100, 3200, port]) await tools.portFree(candidate);
  await listenerAbsent("::1", port);
  if (tools.connections() !== 0) fail("Database clients remain; run manual QA separately from other campaigns");
  for (const record of manifest.databases) {
    if (!record.ready) fail("Incomplete registered database requires inspection");
    await assertDatabaseIdentity(databaseUrl(manifest, record.name, "runtime"), manifest, "runtime");
    await assertDatabaseIdentity(databaseUrl(manifest, record.name, "migration"), manifest, "migration");
  }
}

async function cleanup(session: ManualSession, tools: ManualDatabaseTools) {
  const lock = join(directory(session), "cleanup.lock"); regularPath(lock);
  writeFileSync(lock, session.sessionId, { flag: "wx", mode: 0o600 });
  try {
    tools.verify();
    const current = readSession();
    if (current.sessionId !== session.sessionId || current.databaseMarker !== session.databaseMarker) fail("Manual cleanup session changed");
    const registered = readManifest().databases.some(row => row.name === session.databaseName);
    if (registered) { const database = await manualDatabase(session); await database.end(); }
    else if (session.phase !== "allocated") fail("Manual target registration is missing; preserve metadata for inspection");
    session.phase = "cleaning"; persist(session);
    if (session.childPid !== null && !processAbsent(session.childPid)) {
      if (!existsSync(controlPath)) fail("Owned application has no verifiable control channel; no process killed");
      await controlCommand(session, "status");
      await controlCommand(session, "stop");
      await waitUntil(() => processAbsent(session.childPid!), 15000, "Application did not exit; database preserved");
    }
    await tools.portFree(port); await listenerAbsent("::1", port);
    if (existsSync(controlPath)) {
      const { raw, control } = readControl(session);
      if (!processAbsent(control.pid)) fail("Application process still exists; control state preserved");
      await listenerAbsent("127.0.0.1", control.port);
      if (readFileSync(controlPath, "utf8") !== raw) fail("Control registration changed; cleanup refused");
      unlinkSync(controlPath);
    }
    if (tools.connections(session.databaseName) !== 0) fail("Connections remain on the manual database; non-forced cleanup refused");
    if (registered) {
      const database = await manualDatabase(session); await database.end();
      await tools.remove(session.databaseName);
    }
    session.phase = "closed"; persist(session);
    if (readSession().sessionId !== session.sessionId) fail("Manual registration changed before release");
    unlinkSync(activePath);
    console.log(`Manual QA ${session.sessionId} closed; ${registered ? "only its disposable database was removed" : "no database had been registered"}. Observer evidence retained in ${directory(session)}`);
  } finally {
    if (readFileSync(lock, "utf8") === session.sessionId) unlinkSync(lock);
  }
}

async function start(manifest: LocalManifest, tools: ManualDatabaseTools) {
  await preflight(manifest, tools);
  const sessionId = randomBytes(6).toString("hex");
  const session: ManualSession = {
    version: 1, sessionId, root: realpathSync("."), owner: manifest.owner, containerId: manifest.containerId!, buildId: checkpoint.buildId,
    databaseName: `usp_m1b_${manifest.owner}_test_${sessionId}`, databaseMarker: `mqa_${randomBytes(16).toString("hex")}`,
    entryDatabaseNames: manifest.databases.map(row => row.name), launcherPid: process.pid, childPid: null, controlDigest: null,
    phase: "allocated", createdAt: new Date().toISOString(), lastFailure: null,
  };
  if (session.entryDatabaseNames.includes(session.databaseName)) fail("Manual target name collision; nothing adopted");
  mkdirSync(directory(session), { mode: 0o700 });
  writeFileSync(activePath, JSON.stringify(session, null, 2), { flag: "wx", mode: 0o600 });
  persist(session);
  let stopRequested = false, childExited = false, childCode: number | null = null;
  const requestStop = () => { stopRequested = true; };
  const checkStop = () => { if (stopRequested || existsSync(stopPath(session))) throw new ManualStopRequested("Manual stop requested during setup"); };
  process.on("SIGINT", requestStop); process.on("SIGTERM", requestStop);
  let failure: string | null = null;
  try {
    checkStop();
    session.phase = "creating"; persist(session);
    const record: DatabaseRecord = { name: session.databaseName, kind: "test", ready: false };
    tools.register(record);
    await tools.create(record, session.databaseMarker);
    checkStop();
    session.phase = "migrating"; persist(session);
    const database = await manualDatabase(session); await database.end();
    await tools.migrate(session.databaseName);
    checkStop();
    session.phase = "seeding"; persist(session);
    const reference = await seedManualFixtures(session);
    writeFileSync(join(directory(session), "observer-reference.json"), JSON.stringify(reference, null, 2), { flag: "wx", mode: 0o600 });
    checkStop();
    session.phase = "starting"; persist(session);
    // Detached/hidden isolates terminal Ctrl+C from the child. Shutdown uses its
    // authenticated control channel, never a stale PID or forced process kill.
    // Unsanitized Next/provider stacks are not relayed; readiness/exit is explicit.
    const child = spawn(process.execPath, ["tools/identity/preview-server.mts", "check"], {
      detached: true, windowsHide: true, stdio: "ignore",
      env: { ...process.env, NODE_ENV: "production", USP_PREVIEW_TEST_DATABASE: session.databaseName,
        USP_LOCAL_PREVIEW_PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
    });
    child.on("error", () => { childExited = true; });
    child.on("exit", code => { childExited = true; childCode = code; });
    child.unref(); // An unprovable shutdown must not trap a failed supervisor; explicit recovery remains available.
    session.childPid = child.pid ?? null; persist(session);
    await waitUntil(() => {
      if (childExited) fail("Manual preview exited before readiness; inspect the owned session");
      checkStop();
      return existsSync(controlPath);
    }, 60000, "Manual preview readiness timed out; no automatic retry");
    session.controlDigest = hash(readControl(session).raw);
    await controlCommand(session, "status");
    session.phase = "running"; persist(session);
    console.log(`Manual QA ${session.sessionId} ready: http://localhost:${port}/en/signin and /ar/signin`);
    console.log(`Synthetic aliases and expected results (observer only): ${join(directory(session), "observer-reference.json")}`);
    console.log("Use separate temporary browser profiles. Request a sign-in link → Open local confirmation → Confirm sign-in. No real email is sent.");
    console.log("Keep this supervisor open. Stop with Ctrl+C or npm.cmd run qa:manual:stop; inspect with npm.cmd run qa:manual:status.");
    await waitUntil(() => stopRequested || existsSync(stopPath(session)) || childExited, Infinity, "Manual session wait failed");
    if (childExited) fail(`Manual application exited unexpectedly (code ${childCode ?? "unavailable"})`);
  } catch (error) {
    if (!(error instanceof ManualStopRequested)) failure = error instanceof ManualSessionError ? error.message : `Manual QA failed during ${session.phase}; sensitive provider diagnostics omitted`;
    session.lastFailure = failure;
  } finally {
    try { await cleanup(session, tools); }
    catch (error) {
      const detail = error instanceof ManualSessionError ? error.message : "Shutdown/cleanup could not prove safety";
      session.lastFailure = `${failure ? `${failure}. ` : ""}${detail}. Resources preserved; inspect status before recovery.`;
      session.phase = "incomplete";
      persist(session);
      fail(`Manual QA cleanup incomplete. Inspect ${activePath} and use qa:manual:status; no forced cleanup performed`);
    } finally { process.off("SIGINT", requestStop); process.off("SIGTERM", requestStop); }
  }
  if (failure) fail(failure);
}

export async function runManualSession(operation: "start" | "status" | "stop", manifest: LocalManifest, tools: ManualDatabaseTools) {
  if (operation === "start") return start(manifest, tools);
  if (!existsSync(activePath)) { console.log("No registered manual QA session; nothing changed"); return; }
  const session = readSession();
  tools.verify();
  if (operation === "status") {
    let databaseVerified = false, applicationControlVerified = false;
    try { const database = await manualDatabase(session); await database.end(); databaseVerified = true; }
    catch { /* Report failed live verification explicitly without private driver diagnostics. */ }
    const applicationPresent = session.childPid !== null && !processAbsent(session.childPid);
    if (applicationPresent && existsSync(controlPath)) {
      try { await controlCommand(session, "status"); applicationControlVerified = true; }
      catch { /* A PID alone is never reported as proof of owned application control. */ }
    }
    console.log(JSON.stringify({ sessionId: session.sessionId, database: session.databaseName, phase: session.phase,
      origin: `http://localhost:${port}`, launcherPresent: !processAbsent(session.launcherPid),
      applicationPresent, databaseVerified, applicationControlVerified,
      stopRequested: existsSync(stopPath(session)), lastFailure: session.lastFailure,
      observerReference: join(directory(session), "observer-reference.json") }, null, 2));
    if (session.phase === "running" && (!databaseVerified || !applicationControlVerified)) fail("Live manual session ownership could not be verified; inspect resources");
    return;
  }
  if (!processAbsent(session.launcherPid)) {
    // Ask the live supervisor to perform its normal lifecycle. Never signal a
    // PID read from disk: a reused PID must not stop an unrelated process.
    if (!existsSync(stopPath(session))) writeFileSync(stopPath(session), session.sessionId, { flag: "wx", mode: 0o600 });
    await waitUntil(() => {
      if (!existsSync(activePath)) return true;
      const current = readSession();
      if (current.sessionId !== session.sessionId) fail("Another manual session is now registered");
      if (current.phase === "incomplete") fail("Supervisor reported incomplete cleanup; resources preserved");
      return false;
    }, 60000, "Supervisor did not finish shutdown; resources preserved, no process killed");
    console.log(`Manual QA ${session.sessionId}: supervisor completed shutdown`);
  } else {
    // An interrupted supervisor leaves its session-specific creation marker,
    // child identity and control registration for conservative explicit recovery.
    try { await cleanup(session, tools); }
    catch (error) {
      session.lastFailure = error instanceof ManualSessionError ? error.message : "Recovery cleanup failed; sensitive provider diagnostics omitted";
      session.phase = "incomplete"; persist(session);
      fail("Manual recovery incomplete; resources preserved for inspection, no forced cleanup");
    }
  }
}
