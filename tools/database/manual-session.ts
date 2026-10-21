import { parseOperationalJson } from "./operational-errors.ts";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { validateManifest, type LocalManifest, type DatabaseRecord } from "./targets.ts";

import { assertLocalPath, assertPrivatePath, databaseDirectory, powershellPath, readPrivateFile, runtimeDirectory, writePrivateFile } from "./runtime-files.ts";
import { validateProcessIdentity, type ProcessIdentity } from "./windows-process.ts";
import { type LifecycleLease } from "./lifecycle-lock.ts";
export { assertLocalPath, assertPrivatePath, powershellPath } from "./runtime-files.ts";
export { acquireLifecycleLock, lifecycleLockPath } from "./lifecycle-lock.ts";

export const manualDirectory = resolve(runtimeDirectory, "manual-identity");
export const manualSessionPath = resolve(manualDirectory, "session.json");
export const manualControlPath = resolve(manualDirectory, "control.json");
export const manualPhases = ["preparing", "prepared", "starting", "running", "stopping", "stopped", "interrupted", "cleaning", "recovering", "recovered"] as const;
export type ManualPhase = typeof manualPhases[number];
export type RunExecution = { server: ProcessIdentity; supervisor: ProcessIdentity; leaseNonce: string; controlPort: number | null };
export type RecoveryRecord = {
  id: string; runId: string; from: "starting" | "running" | "stopping" | "interrupted"; outcome: "interrupted";
  recordedAt: string; proofBoot: string; execution: RunExecution; controlHash: string | null;
};
export type ManualSession = {
  version: 1; root: string; owner: string; databaseName: string; sessionId: string;
  phase: ManualPhase; runId: string | null; pid: number | null;
  execution?: RunExecution | null; recoveries?: RecoveryRecord[];
};

export function validateExecution(value: unknown): RunExecution {
  const e = value as RunExecution;
  if (!e || Object.keys(e).sort().join(",") !== "controlPort,leaseNonce,server,supervisor" ||
      !/^[a-f0-9]{32}$/.test(e.leaseNonce) || !(e.controlPort === null || (Number.isInteger(e.controlPort) && e.controlPort >= 1024 && e.controlPort <= 65535))) throw new Error("Run execution evidence unavailable");
  validateProcessIdentity(e.server); validateProcessIdentity(e.supervisor);
  if (e.server.parentPid !== e.supervisor.pid || e.server.boot !== e.supervisor.boot || e.server.sid !== e.supervisor.sid ||
      e.server.executable.toLowerCase() !== e.supervisor.executable.toLowerCase() || BigInt(e.server.started) < BigInt(e.supervisor.started)) throw new Error("Run process ancestry refused");
  return e;
}
function validateRecovery(value: unknown): RecoveryRecord {
  const r = value as RecoveryRecord;
  if (!r || Object.keys(r).sort().join(",") !== "controlHash,execution,from,id,outcome,proofBoot,recordedAt,runId" ||
      !/^[a-f0-9]{32}$/.test(r.id) || !/^[a-f0-9]{32}$/.test(r.runId) || !["starting", "running", "stopping", "interrupted"].includes(r.from) ||
      r.outcome !== "interrupted" || typeof r.recordedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.recordedAt) || !Number.isFinite(Date.parse(r.recordedAt)) ||
      !/^[1-9][0-9]{15,19}$/.test(r.proofBoot) || !(r.controlHash === null || /^[a-f0-9]{64}$/.test(r.controlHash))) throw new Error("Recovery record refused");
  validateExecution(r.execution);
  return r;
}

export function checkManualFiles(createDirectory = false) {
  powershellPath(); // Preserve the reviewed Windows-only manual transport gate.
  assertPrivatePath(manualDirectory, createDirectory);
  for (const path of [databaseDirectory, ...["manifest.json", "bootstrap-password", "compose.env"].map((name) => resolve(databaseDirectory, name))]) assertPrivatePath(path);
  for (const path of [manualSessionPath, manualControlPath]) if (existsSync(path)) assertPrivatePath(path);
}

export function newManualSession(m: LocalManifest): ManualSession {
  validateManifest(m);
  return { version: 1, root: resolve("."), owner: m.owner,
    databaseName: `usp_m1b_${m.owner}_test_${randomBytes(6).toString("hex")}`,
    sessionId: randomBytes(16).toString("hex"), phase: "preparing", runId: null, pid: null };
}

export function validateManualSession(value: unknown, m: LocalManifest): ManualSession {
  validateManifest(m);
  if (!value || typeof value !== "object") throw new Error("Manual session unavailable");
  const s = value as ManualSession;
  if (Object.keys(s).filter((key) => !["execution", "recoveries"].includes(key)).sort().join(",") !== "databaseName,owner,phase,pid,root,runId,sessionId,version" ||
      s.version !== 1 || s.root !== resolve(".") || s.owner !== m.owner ||
      typeof s.databaseName !== "string" || !new RegExp(`^usp_m1b_${m.owner}_test_[a-f0-9]{12}$`).test(s.databaseName) ||
      typeof s.sessionId !== "string" || !/^[a-f0-9]{32}$/.test(s.sessionId) || !manualPhases.includes(s.phase) ||
      !(s.runId === null || (typeof s.runId === "string" && /^[a-f0-9]{32}$/.test(s.runId))) ||
      !(s.pid === null || (Number.isSafeInteger(s.pid) && s.pid > 0)) ||
      (["prepared", "stopped", "preparing", "cleaning", "recovered"].includes(s.phase) && (s.runId !== null || s.pid !== null)) ||
      (["starting", "running", "stopping"].includes(s.phase) && !s.runId) || (s.phase === "running" && s.pid === null)) {
    throw new Error("Manual session identity or state refused");
  }
  if (s.execution !== undefined && s.execution !== null) {
    validateExecution(s.execution);
    if (!s.runId || s.pid !== s.execution.server.pid) throw new Error("Run process identity mismatch");
  }
  if (s.recoveries !== undefined) {
    if (!Array.isArray(s.recoveries) || s.recoveries.length > 32 || new Set(s.recoveries.map((r) => r.id)).size !== s.recoveries.length) throw new Error("Recovery history refused");
    s.recoveries.forEach(validateRecovery);
  }
  const last = s.recoveries?.at(-1);
  if ((s.phase === "recovering" && (!s.execution || !last || last.runId !== s.runId || JSON.stringify(last.execution) !== JSON.stringify(s.execution))) ||
      (s.phase === "recovered" && (!last || s.execution))) throw new Error("Recovery lifecycle state refused");
  return s;
}

export function readManualSession(m: LocalManifest) {
  assertLocalPath(manualSessionPath);
  return validateManualSession(parseOperationalJson(readPrivateFile(manualSessionPath), "SESSION_JSON"), m);
}

export function writeManualSession(s: ManualSession, m: LocalManifest, initial = false) {
  validateManualSession(s, m);
  assertLocalPath(manualSessionPath);
  if (initial) {
    assertPrivatePath(manualDirectory, true);
    if (readdirSync(manualDirectory).some((name) => name.startsWith("session.next"))) throw new Error("Ambiguous session write requires inspection");
    writePrivateFile(manualSessionPath, JSON.stringify(s), true);
    return;
  }
  const current = readManualSession(m);
  if (current.sessionId !== s.sessionId || current.databaseName !== s.databaseName) throw new Error("Refusing another manual session's state");
  const contents = JSON.stringify(s);
  const temporary = resolve(manualDirectory, `session.next-${createHash("sha256").update(contents).digest("hex")}.json`);
  assertLocalPath(temporary);
  assertPrivatePath(manualDirectory);
  // Preserve competing writes; they may contain an uncommitted recovery journal.
  if (readdirSync(manualDirectory).some((name) => name.startsWith("session.next") && resolve(manualDirectory, name) !== temporary)) {
    throw new Error("Ambiguous session write requires inspection");
  }
  if (existsSync(temporary)) {
    if (readPrivateFile(temporary) !== contents) throw new Error("Incomplete session write requires inspection");
  } else writePrivateFile(temporary, contents, true, true);
  assertPrivatePath(manualSessionPath);
  renameSync(temporary, manualSessionPath);
}

export function authorizeManualOperation(s: ManualSession, m: LocalManifest, operation: "start" | "token" | "cleanup"): DatabaseRecord {
  validateManualSession(s, m);
  const record = m.databases.find((item) => item.name === s.databaseName && item.kind === "test" && item.ready);
  const permitted = operation === "token" ? ["running"] : ["prepared", "stopped", "recovered"];
  if (!record || !permitted.includes(s.phase)) throw new Error("Manual operation refused; incomplete or active state requires inspection");
  return record;
}

export function beginManualRun(s: ManualSession, m: LocalManifest, lease: LifecycleLease): ManualSession {
  authorizeManualOperation(s, m, "start");
  if (!lease.lock || lease.lock.command !== "manual-start" || lease.lock.nonce === s.recoveries?.at(-1)?.execution.leaseNonce) throw new Error("Fresh Windows supervisor lease required");
  const next: ManualSession = { ...s, phase: "starting", runId: randomBytes(16).toString("hex"), pid: null, execution: null };
  lease.bind({ sessionId: s.sessionId, runId: next.runId!, databaseName: s.databaseName, recoveryId: null, sourceNonce: null });
  return next;
}

// No automatic adoption, rollback/drop, or recovery after a failed preparation.
export async function prepareSession(s: ManualSession, operations: {
  save: (s: ManualSession) => void; register: () => void;
  create: () => Promise<void>; migrate: () => Promise<void>; verify: () => Promise<void>;
}) {
  if (s.phase !== "preparing") throw new Error("Preparation state refused");
  try {
    operations.register();
    await operations.create();
    await operations.migrate();
    await operations.verify();
    const prepared: ManualSession = { ...s, phase: "prepared" };
    operations.save(prepared);
    return prepared;
  } catch {
    operations.save({ ...s, phase: "interrupted" });
    throw new Error("Manual preparation interrupted; retained resources require inspection");
  }
}

export async function cleanupSession(s: ManualSession, m: LocalManifest, operations: {
  controlExists: () => boolean; verify: () => Promise<void>; save: (s: ManualSession) => void;
  drop: (record: DatabaseRecord) => Promise<void>; forget: () => void;
}) {
  const record = authorizeManualOperation(s, m, "cleanup");
  if (operations.controlExists()) throw new Error("Control state remains; cleanup refused");
  await operations.verify();
  operations.save({ ...s, phase: "cleaning" });
  // If DROP or manifest persistence fails, cleaning remains blocked for inspection.
  await operations.drop(record);
  operations.forget();
}

export function stoppedSession(s: ManualSession, cleanAcknowledgement: boolean, code: number | null): ManualSession {
  return cleanAcknowledgement && code === 0
    ? { ...s, phase: "stopped", runId: null, pid: null, execution: null }
    : { ...s, phase: "interrupted" };
}

export type ManualControl = { port: number; key: string; databaseName: string; sessionId: string; runId: string; pid: number };
export function validateManualControl(value: unknown, s: ManualSession): ManualControl {
  if (!value || typeof value !== "object") throw new Error("Manual mailbox unavailable");
  const c = value as ManualControl;
  if (Object.keys(c).sort().join(",") !== "databaseName,key,pid,port,runId,sessionId" ||
      !Number.isInteger(c.port) || c.port < 1024 || c.port > 65535 ||
      typeof c.key !== "string" || !/^[a-f0-9]{64}$/.test(c.key) ||
      !s.runId || c.runId !== s.runId || c.sessionId !== s.sessionId || c.databaseName !== s.databaseName || c.pid !== s.pid) {
    throw new Error("Manual mailbox identity mismatch");
  }
  return c;
}
