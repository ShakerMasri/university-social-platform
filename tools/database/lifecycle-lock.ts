import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { assertPrivatePath, powershellPath, readPrivateFile, runtimeDirectory, writePrivateFile } from "./runtime-files.ts";
import { inspectProcesses, validateProcessIdentity, type ProcessIdentity } from "./windows-process.ts";

export const lifecycleLockPath = resolve(runtimeDirectory, "local-db-operation.lock");
export const lifecycleGatePath = resolve(runtimeDirectory, "local-db-operation.gate");
export type RunScope = { sessionId: string; runId: string; databaseName: string; recoveryId: string | null; sourceNonce: string | null };
export type LifecycleLock = { version: 2; root: string; pid: number; command: string; nonce: string; process: ProcessIdentity; scope: RunScope | null };
export type OperationGate = { assertHeld: () => void; release: () => Promise<void> };

// A live OS handle fences ALL mutating commands, including stale-lease retirement.
// This is synchronization only, not a second lifecycle state machine. Its empty
// file is never removed, and Windows releases the handle on helper/process exit.
export const gateScript = `
$ErrorActionPreference = 'Stop'
$stream = $null
try {
  $path = [Console]::In.ReadLine()
  $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  [Console]::Out.WriteLine('held')
  [Console]::Out.Flush()
  if ([Console]::In.ReadLine() -ne 'release') { exit 1 }
} catch { exit 1 }
finally { if ($null -ne $stream) { $stream.Dispose() } }
`;
export async function acquireOperationGate(): Promise<OperationGate> {
  assertPrivatePath(runtimeDirectory, true);
  if (process.platform !== "win32") return { assertHeld() {}, async release() {} }; // POSIX retains exclusive wx leases; recovery is Windows-only.
  if (!existsSync(lifecycleGatePath)) {
    try { writePrivateFile(lifecycleGatePath, "", true); }
    catch { if (!existsSync(lifecycleGatePath)) throw new Error("Lifecycle gate unavailable"); }
  }
  assertPrivatePath(lifecycleGatePath);
  return new Promise((accept, reject) => {
    const child = spawn(powershellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", gateScript], {
      windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
    });
    let held = false, ended = false, releasing = false, output = "";
    const closed = new Promise<void>((resolveClose, rejectClose) => {
      child.once("close", (code) => {
        ended = true; clearTimeout(deadline);
        if (!held) reject(new Error("Lifecycle gate busy or unavailable"));
        if (releasing && code === 0) resolveClose(); else rejectClose(new Error("Lifecycle gate lost"));
      });
    });
    void closed.catch(() => {}); // Observed again by release; never an unhandled rejection.
    const fail = (message: string) => {
      ended = true; clearTimeout(deadline);
      child.stdin.destroy(); child.kill(); // Only our newly spawned gate helper, never a persisted PID.
      reject(new Error(message));
    };
    const deadline = setTimeout(() => fail("Lifecycle gate timeout"), 10000);
    child.once("error", () => fail("Lifecycle gate unavailable"));
    child.stdin.on("error", () => fail("Lifecycle gate unavailable"));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output === "held\r\n" || output === "held\n") {
        held = true; clearTimeout(deadline);
        accept({
          assertHeld() { if (!held || ended || releasing) throw new Error("Lifecycle gate not held"); },
          async release() {
            if (ended || releasing) throw new Error("Lifecycle gate release refused");
            releasing = true; child.stdin.end("release\n");
            const timer = setTimeout(() => { child.stdin.destroy(); child.kill(); }, 10000);
            try { await closed; } finally { clearTimeout(timer); }
          },
        });
      } else if (output.length > 16 || output.includes("\n")) {
        fail("Lifecycle gate protocol refused");
      }
    });
    child.stdin.write(lifecycleGatePath + "\n");
  });
}
export function validateLifecycleLock(value: unknown): LifecycleLock {
  const lock = value as LifecycleLock;
  if (!lock || lock.version !== 2 || Object.keys(lock).sort().join(",") !== "command,nonce,pid,process,root,scope,version" ||
      lock.root !== resolve(".") || typeof lock.command !== "string" || !/^[a-z-]+$/.test(lock.command) ||
      !/^[a-f0-9]{32}$/.test(lock.nonce) || lock.pid !== validateProcessIdentity(lock.process).pid) throw new Error("Legacy or invalid lifecycle lease; recovery proof unavailable");
  if (lock.scope !== null) {
    const s = lock.scope;
    if (Object.keys(s).sort().join(",") !== "databaseName,recoveryId,runId,sessionId,sourceNonce" ||
        !/^[a-f0-9]{32}$/.test(s.sessionId) || !/^[a-f0-9]{32}$/.test(s.runId) ||
        !/^usp_m1b_[a-f0-9]{12}_test_[a-f0-9]{12}$/.test(s.databaseName) ||
        !(s.recoveryId === null || /^[a-f0-9]{32}$/.test(s.recoveryId)) || !(s.sourceNonce === null || /^[a-f0-9]{32}$/.test(s.sourceNonce))) throw new Error("Lifecycle scope refused");
  }
  return lock;
}
export type LifecycleLease = (() => Promise<void>) & { lock: LifecycleLock | null; bind: (scope: RunScope) => void; assertHeld: () => void };
export function createLifecycleLease(command: string, gate: OperationGate, scope: RunScope | null = null): LifecycleLease {
  gate.assertHeld();
  let lock: LifecycleLock | null = null;
  if (process.platform === "win32") {
    const self = inspectProcesses([process.pid]).processes.find((p) => p.pid === process.pid);
    if (!self) throw new Error("Supervisor identity unavailable");
    lock = validateLifecycleLock({ version: 2, root: resolve("."), pid: process.pid, command, nonce: randomBytes(16).toString("hex"), process: self, scope });
  }
  let contents = JSON.stringify(lock ?? { version: 1, root: resolve("."), pid: process.pid, command, nonce: randomBytes(16).toString("hex") });
  writePrivateFile(lifecycleLockPath, contents, true, true);
  const release = Object.assign(async () => {
    gate.assertHeld();
    if (readPrivateFile(lifecycleLockPath) !== contents) throw new Error("Lifecycle lock ownership changed; release refused");
    unlinkSync(lifecycleLockPath);
  }, {
    lock,
    assertHeld() {
      gate.assertHeld();
      if (readPrivateFile(lifecycleLockPath) !== contents) throw new Error("Lifecycle lease ownership changed");
    },
    bind(scope: RunScope) {
      gate.assertHeld();
      if (!lock || readPrivateFile(lifecycleLockPath) !== contents) throw new Error("Lifecycle lease binding refused");
      const next = validateLifecycleLock({ ...lock, scope });
      writePrivateFile(lifecycleLockPath, JSON.stringify(next), false, true);
      contents = JSON.stringify(next); lock = next; release.lock = next;
    },
  });
  return release;
}
export async function acquireLifecycleLock(command: string): Promise<LifecycleLease> {
  const gate = await acquireOperationGate();
  try {
    const lease = createLifecycleLease(command, gate);
    const owned = Object.assign(async () => { try { await lease(); } finally { await gate.release(); } }, {
      lock: lease.lock, assertHeld: () => lease.assertHeld(), bind(scope: RunScope) { lease.bind(scope); owned.lock = lease.lock; },
    });
    return owned;
  } catch { await gate.release(); throw new Error("Local lifecycle lock exists or is unavailable; inspection required"); }
}
