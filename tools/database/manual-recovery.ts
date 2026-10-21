import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { readManifest, validateManifest, type LocalManifest } from "./targets.ts";
import { assertPrivatePath, browserControlPath, readPrivateFile } from "./runtime-files.ts";
import { ensurePortFree } from "./ports.ts";
import {
  acquireOperationGate, createLifecycleLease, lifecycleLockPath, validateLifecycleLock,
  type LifecycleLock, type LifecycleLease, type OperationGate, type RunScope,
} from "./lifecycle-lock.ts";
import {
  checkManualFiles, manualDirectory, manualControlPath, readManualSession, validateManualControl,
  validateManualSession, writeManualSession, type ManualSession, type RecoveryRecord,
} from "./manual-session.ts";
import { assertProvenDead, inspectProcesses, sameProcess, type ProcessSnapshot } from "./windows-process.ts";

export class RecoveryRefusal extends Error {
  readonly code: "LEGACY_EVIDENCE" | "STATE" | "METADATA" | "PROCESS" | "PORT" | "OWNERSHIP" | "CHANGED" | "IO";
  constructor(code: RecoveryRefusal["code"]) {
    super(`Manual recovery refused (${code}); retained state requires inspection`);
    this.code = code;
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export type RecoveryOperations = {
  gate: OperationGate;
  readSession: () => ManualSession; readControl: () => string | null; readLease: () => string | null;
  inspect: (pids: number[]) => ProcessSnapshot; ports: (ports: number[]) => Promise<void>;
  verify: () => Promise<void>;
  claim: (expectedLease: string | null, scope: RunScope) => LifecycleLease;
  save: (session: ManualSession) => void; retireControl: (expected: string) => void;
};

// Operates on the existing lifecycle, not a separate recovery state machine.
// No SQL writes, provisioning, migrations, Docker mutation, process termination,
// credential reuse, or database-name replacement are available to this function.
export async function recoverSession(s: ManualSession, m: LocalManifest, ops: RecoveryOperations) {
  ops.gate.assertHeld();
  validateManualSession(s, m); validateManifest(m);
  if (!m.containerId || !m.databases.some((d) => d.name === s.databaseName && d.kind === "test" && d.ready)) throw new RecoveryRefusal("OWNERSHIP");
  if (!["starting", "running", "stopping", "interrupted", "recovering", "recovered"].includes(s.phase)) throw new RecoveryRefusal("STATE");
  const previous = s.recoveries?.at(-1);
  const execution = s.phase === "recovered" ? previous?.execution : s.execution;
  const runId = s.phase === "recovered" ? previous?.runId : s.runId;
  if (!execution || !runId) throw new RecoveryRefusal("LEGACY_EVIDENCE");
  if (s.phase !== "recovering" && s.phase !== "recovered" && (s.recoveries?.length ?? 0) >= 32) throw new RecoveryRefusal("STATE");
  const controlText = ops.readControl(), leaseText = ops.readLease();
  let lock: LifecycleLock | null = null;
  let controlPort = execution.controlPort;
  try {
    if (leaseText !== null) {
      lock = validateLifecycleLock(JSON.parse(leaseText));
      const scope = lock.scope;
      if (!scope || scope.sessionId !== s.sessionId || scope.runId !== runId || scope.databaseName !== s.databaseName) throw new Error();
      if (lock.command === "manual-start") {
        if (s.phase === "recovered" || lock.nonce !== execution.leaseNonce || !sameProcess(lock.process, execution.supervisor) || scope.recoveryId !== null || scope.sourceNonce !== null) throw new Error();
      } else if (lock.command === "manual-recover") {
        if (!scope.recoveryId || scope.sourceNonce !== execution.leaseNonce ||
            (["recovering", "recovered"].includes(s.phase) && scope.recoveryId !== previous?.id)) throw new Error();
      } else throw new Error();
    }
    if (controlText !== null) {
      if (s.phase === "recovered") throw new Error();
      const c = validateManualControl(JSON.parse(controlText), s);
      if (controlPort !== null && controlPort !== c.port) throw new Error();
      controlPort = c.port;
    } else if (s.phase === "running") throw new Error();
    if (s.phase === "recovering" && (!previous || previous.controlHash !== (controlText === null ? previous.controlHash : hash(controlText)) ||
        (previous.controlHash === null && controlText !== null))) throw new Error();
  } catch { throw new RecoveryRefusal("METADATA"); }
  const identities = [execution.server, execution.supervisor, ...(lock ? [lock.process] : [])];
  const prove = () => {
    try {
      const snapshot = ops.inspect(identities.map((p) => p.pid));
      identities.forEach((p) => assertProvenDead(p, snapshot));
      return snapshot.boot;
    } catch { throw new RecoveryRefusal("PROCESS"); }
  };
  const checkPorts = async () => {
    try { await ops.ports([...new Set([3100, ...(controlPort === null ? [] : [controlPort])])]); }
    catch { throw new RecoveryRefusal("PORT"); }
  };
  prove();
  await checkPorts();
  try { await ops.verify(); } catch { throw new RecoveryRefusal("OWNERSHIP"); }
  ops.gate.assertHeld();
  if (JSON.stringify(ops.readSession()) !== JSON.stringify(s) || ops.readControl() !== controlText || ops.readLease() !== leaseText) throw new RecoveryRefusal("CHANGED");
  const proofBoot = prove(); // Fresh OS evidence after awaited resource checks.
  await checkPorts();
  ops.gate.assertHeld();
  if (ops.readControl() !== controlText || ops.readLease() !== leaseText || JSON.stringify(ops.readSession()) !== JSON.stringify(s)) throw new RecoveryRefusal("CHANGED");
  const record: RecoveryRecord = ["recovering", "recovered"].includes(s.phase) ? previous! : {
    id: lock?.command === "manual-recover" ? lock.scope!.recoveryId! : randomBytes(16).toString("hex"),
    runId, from: s.phase as RecoveryRecord["from"], outcome: "interrupted", recordedAt: new Date().toISOString(), proofBoot,
    execution: { ...execution, controlPort }, controlHash: controlText === null ? null : hash(controlText),
  };
  const lease = ops.claim(leaseText, { sessionId: s.sessionId, databaseName: s.databaseName, runId, recoveryId: record.id, sourceNonce: execution.leaseNonce });
  try {
    if (s.phase === "recovered") return s; // Idempotent completion, still fully checked.
    const history = s.phase === "recovering" ? s.recoveries! : [...s.recoveries ?? [], record];
    const pending: ManualSession = { ...s, phase: "recovering", execution: record.execution, recoveries: history };
    // A committed journal already supplies the durable evidence. Rewriting it
    // would conflict with an exact final-state temp file left before rename.
    if (s.phase !== "recovering") ops.save(pending);
    ops.gate.assertHeld();
    if (controlText !== null) ops.retireControl(controlText);
    const recovered: ManualSession = { ...pending, phase: "recovered", runId: null, pid: null, execution: null };
    ops.save(recovered);
    return recovered;
  } finally { await lease(); }
}

export async function recoverManualQa(verify: (m: LocalManifest, s: ManualSession) => Promise<void>) {
  const gate = await acquireOperationGate();
  try {
    checkManualFiles();
    const m = readManifest(), s = readManualSession(m);
    // Never adopt legacy pending writes, Playwright ownership or foreign control files.
    if (existsSync(browserControlPath) || existsSync(resolve(manualDirectory, "session.next.json"))) throw new RecoveryRefusal("METADATA");
    const readOptional = (path: string) => {
      try { lstatSync(path); }
      catch (error) {
        if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
        throw new RecoveryRefusal("IO");
      }
      return readPrivateFile(path);
    };
    return await recoverSession(s, m, {
      gate, readSession: () => readManualSession(m), readControl: () => readOptional(manualControlPath), readLease: () => readOptional(lifecycleLockPath),
      inspect: inspectProcesses,
      ports: async (ports) => { for (const port of ports) await ensurePortFree(port); },
      verify: () => verify(m, s),
      claim(expected, scope) {
        gate.assertHeld();
        if (readOptional(lifecycleLockPath) !== expected) throw new RecoveryRefusal("CHANGED");
        if (expected !== null) { assertPrivatePath(lifecycleLockPath); unlinkSync(lifecycleLockPath); }
        return createLifecycleLease("manual-recover", gate, scope);
      },
      save: (next) => writeManualSession(next, m),
      retireControl(expected) {
        gate.assertHeld();
        if (readOptional(manualControlPath) !== expected) throw new RecoveryRefusal("CHANGED");
        assertPrivatePath(manualControlPath); unlinkSync(manualControlPath);
      },
    });
  } catch (error) {
    if (error instanceof RecoveryRefusal) throw error;
    throw new RecoveryRefusal("IO");
  } finally { await gate.release(); }
}
