import { finishManualRun, retireChildControl } from "./manual-shutdown";
import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { recoverSession, type RecoveryOperations } from "./manual-recovery";
import { authorizeManualOperation, beginManualRun, validateManualSession, type ManualSession } from "./manual-session";
import { image, type LocalManifest } from "./manual-targets";
import { type LifecycleLease, type LifecycleLock } from "./lifecycle-lock";
import { assertProvenDead, validateProcessIdentity, type ProcessIdentity, type ProcessSnapshot } from "./windows-process";

const boot = "638900000000000000", nextBoot = "638910000000000000";
function identity(pid: number, parentPid: number, started = "638900000010000000"): ProcessIdentity {
  return { pid, parentPid, boot, started, executable: process.execPath, sid: "S-1-5-21-111-222-333-1001" };
}
function fixture() {
  const owner = "abcdef123456", project = `usp-qa-${owner}`, prefix = `usp_qa_${owner}`;
  const m: LocalManifest = { version: 1, root: resolve("."), owner, project, container: `${project}-postgres`, dockerContext: "desktop-linux",
    dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine", containerId: "a".repeat(64), volume: `${project}-data`, image, port: 15432,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64), runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }, { name: `${prefix}_test_123456abcdef`, kind: "test", ready: true }] };
  const s: ManualSession = { version: 1, root: resolve("."), owner, databaseName: m.databases[1].name, sessionId: "d".repeat(32),
    phase: "running", runId: "e".repeat(32), pid: 101,
    execution: { supervisor: identity(100, 99), server: identity(101, 100, "638900000020000000"), leaseNonce: "f".repeat(32), controlPort: 54321 }, recoveries: [] };
  const lock: LifecycleLock = { version: 2, root: s.root, command: "manual-start", pid: 100, nonce: s.execution!.leaseNonce, process: s.execution!.supervisor,
    scope: { sessionId: s.sessionId, databaseName: s.databaseName, runId: s.runId!, recoveryId: null, sourceNonce: null } };
  const state = {
    session: structuredClone(s), lease: JSON.stringify(lock) as string | null,
    control: JSON.stringify({ databaseName: s.databaseName, sessionId: s.sessionId, runId: s.runId, pid: s.pid, port: 54321, key: "a".repeat(64) }) as string | null,
    snapshot: { boot: nextBoot, processes: [] } as ProcessSnapshot,
    rows: { profiles: [{ id: "synthetic-user-a", name: "QA A" }], memberships: ["synthetic-member"], otherDatabase: ["untouched"] },
    calls: [] as string[],
  };
  const ops: RecoveryOperations = {
    gate: { assertHeld: vi.fn(), release: vi.fn(async () => {}) },
    readSession: () => structuredClone(state.session), readLease: () => state.lease, readControl: () => state.control,
    inspect: vi.fn(() => state.snapshot),
    ports: vi.fn(async () => { state.calls.push("ports"); }),
    verify: vi.fn(async () => { state.calls.push("verify-owned-resources-and-marker"); }),
    claim: vi.fn((_expected, scope) => {
      state.calls.push("claim");
      state.lease = JSON.stringify({ ...lock, command: "manual-recover", pid: 500, process: { ...identity(500, 99), boot: nextBoot, started: "638910000010000000" }, scope });
      return Object.assign(vi.fn(async () => { state.calls.push("release"); state.lease = null; }), { lock: JSON.parse(state.lease) as LifecycleLock, bind: vi.fn(), assertHeld: vi.fn() }) as LifecycleLease;
    }),
    save: vi.fn((value) => { validateManualSession(value, m); state.calls.push(value.phase); state.session = structuredClone(value); }),
    retireControl: vi.fn((expected) => {
      expect(state.control === expected).toBe(true); state.calls.push("retire-exact-control"); state.control = null;
    }),
  };
  return { m, s, state, ops, lock };
}

describe("explicit Manual QA recovery, simulated OS/files/resources only", () => {
  it("recovers a shutdown-stale running run without touching databases or unrelated resources", async () => {
    const { s, m, state, ops } = fixture(), rows = structuredClone(state.rows), manifest = structuredClone(m);
    const recovered = await recoverSession(s, m, ops);
    expect(recovered.phase).toBe("recovered");
    expect(recovered.databaseName).toBe(s.databaseName);
    expect(recovered.runId).toBeNull(); expect(recovered.pid).toBeNull(); expect(recovered.execution).toBeNull();
    expect(recovered.recoveries?.[0]).toMatchObject({ runId: s.runId, from: "running", outcome: "interrupted", proofBoot: nextBoot });
    expect(state.control).toBeNull(); expect(state.lease).toBeNull();
    expect(state.calls).toEqual(["ports", "verify-owned-resources-and-marker", "ports", "claim", "recovering", "retire-exact-control", "recovered", "release"]);
    expect(state.rows).toEqual(rows); expect(m).toEqual(manifest);
    expect(authorizeManualOperation(recovered, m, "start").name).toBe(s.databaseName);
    expect(() => authorizeManualOperation(recovered, m, "token")).toThrow();
    const fresh = Object.assign(vi.fn(async () => {}), { lock: { ...JSON.parse(JSON.stringify(fixture().lock)), nonce: "7".repeat(32) } as LifecycleLock, bind: vi.fn(), assertHeld: vi.fn() });
    const starting = beginManualRun(recovered, m, fresh);
    expect(starting.phase).toBe("starting"); expect(starting.runId).not.toBe(s.runId);
    expect(starting.databaseName).toBe(s.databaseName); expect(starting.recoveries).toEqual(recovered.recoveries);
    expect(fresh.bind).toHaveBeenCalledWith(expect.objectContaining({ runId: starting.runId, sessionId: s.sessionId, databaseName: s.databaseName }));
    expect(JSON.stringify(recovered)).not.toContain("a".repeat(64)); // No retired key in audit.
  });

  it("accepts proven Windows PID reuse while refusing the original incarnation", async () => {
    const f = fixture();
    f.state.snapshot = { boot, processes: [{ ...f.s.execution!.server, started: "638900000030000000" }] };
    await expect(recoverSession(f.s, f.m, f.ops)).resolves.toMatchObject({ phase: "recovered" });
    const live = fixture(); live.state.snapshot = { boot, processes: [live.s.execution!.server] };
    await expect(recoverSession(live.s, live.m, live.ops)).rejects.toMatchObject({ code: "PROCESS" });
    expect(live.ops.claim).not.toHaveBeenCalled();
  });

  it.each(["server", "supervisor"] as const)("refuses a live original %s even with port 3200 free", async (which) => {
    const f = fixture(); f.state.snapshot = { boot, processes: [f.s.execution![which]] };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "PROCESS" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it.each([3200, 54321])("refuses an unknown listener on recorded port %s", async (port) => {
    const f = fixture(); f.ops.ports = vi.fn(async (ports) => { if (ports.includes(port)) throw new Error("Busy"); });
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "PORT" });
    expect(f.ops.claim).not.toHaveBeenCalled(); expect(f.ops.save).not.toHaveBeenCalled();
  });

  it.each(["runId", "pid", "databaseName", "sessionId", "key", "port"])("rejects inconsistent control %s", async (field) => {
    const f = fixture(), c = JSON.parse(f.state.control!);
    c[field] = field === "pid" || field === "port" ? 1 : "wrong"; f.state.control = JSON.stringify(c);
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "METADATA" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("refuses missing control for a recorded running session", async () => {
    const f = fixture(); f.state.control = null;
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "METADATA" });
  });

  it.each(["missing", "development", "not-ready"])("refuses a %s registered test target", async (condition) => {
    const f = fixture();
    if (condition === "missing") f.m.databases.pop();
    if (condition === "development") { f.s.databaseName = f.m.databases[0].name; }
    if (condition === "not-ready") f.m.databases[1].ready = false;
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow();
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("refuses Docker ownership or database marker mismatch before mutation", async () => {
    const f = fixture(); f.ops.verify = vi.fn(async () => { throw new Error("Ownership mismatch"); });
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "OWNERSHIP" });
    expect(f.ops.claim).not.toHaveBeenCalled(); expect(f.ops.save).not.toHaveBeenCalled();
  });

  it("requires a recorded container ID instead of adopting a label-matching replacement", async () => {
    const f = fixture(); f.m.containerId = null;
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "OWNERSHIP" });
    expect(f.ops.verify).not.toHaveBeenCalled(); expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("fails closed when private control-file ACL validation fails", async () => {
    const f = fixture(); f.ops.readControl = () => { throw new Error("Private Windows ACL check failed"); };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow("ACL");
    expect(f.ops.claim).not.toHaveBeenCalled(); expect(f.ops.save).not.toHaveBeenCalled();
  });

  it("refuses legacy process metadata and never guesses from an absent PID", async () => {
    const f = fixture(); delete f.s.execution;
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "LEGACY_EVIDENCE" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it.each(["legacy", "foreign-run", "wrong-nonce", "foreign-command"])("never reclaims a %s lease", async (kind) => {
    const f = fixture(), lock = structuredClone(f.lock);
    if (kind === "foreign-run") lock.scope!.runId = "1".repeat(32);
    if (kind === "wrong-nonce") lock.nonce = "2".repeat(32);
    if (kind === "foreign-command") lock.command = "migrate";
    f.state.lease = JSON.stringify(kind === "legacy" ? { version: 1, pid: 100, command: "manual-start" } : lock);
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "METADATA" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("refuses unavailable/ambiguous OS evidence and boot-clock regression", async () => {
    const f = fixture(); f.ops.inspect = () => { throw new Error("CIM unavailable"); };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "PROCESS" });
    f.ops.inspect = () => ({ boot: "638800000000000000", processes: [] });
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "PROCESS" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("detects state replacement during awaited checks", async () => {
    const f = fixture(); f.ops.verify = async () => { f.state.session.runId = "1".repeat(32); };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toMatchObject({ code: "CHANGED" });
    expect(f.ops.claim).not.toHaveBeenCalled();
  });

  it("records interruption before retirement and supports retry after a halfway failure", async () => {
    const f = fixture(), save = f.ops.save;
    f.ops.save = vi.fn((value) => { if (value.phase === "recovered") throw new Error("Synthetic write failure"); save(value); });
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow("Synthetic write failure");
    expect(f.state.session.phase).toBe("recovering"); expect(f.state.control).toBeNull();
    const record = structuredClone(f.state.session.recoveries![0]);
    f.ops.save = save;
    const recovered = await recoverSession(f.state.session, f.m, f.ops);
    expect(recovered.recoveries).toEqual([record]); expect(recovered.phase).toBe("recovered");
    const repeated = await recoverSession(recovered, f.m, f.ops);
    expect(repeated).toEqual(recovered);
  });

  it("leaves old control credentials intact when the interruption journal cannot be persisted", async () => {
    const f = fixture(), before = f.state.control;
    f.ops.save = vi.fn(() => { throw new Error("Synthetic disk failure"); });
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow();
    expect(f.state.control === before).toBe(true); expect(f.state.session.phase).toBe("running");
    expect(f.ops.retireControl).not.toHaveBeenCalled();
  });

  it("retains the pending interruption and exact old control when retirement fails, then retries", async () => {
    const f = fixture(), retire = f.ops.retireControl, before = f.state.control;
    f.ops.retireControl = () => { throw new Error("Synthetic removal failure"); };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow("Synthetic removal failure");
    expect(f.state.session.phase).toBe("recovering"); expect(f.state.control === before).toBe(true);
    expect(() => authorizeManualOperation(f.state.session, f.m, "start")).toThrow();
    f.ops.retireControl = retire;
    const result = await recoverSession(f.state.session, f.m, f.ops);
    expect(result.phase).toBe("recovered"); expect(result.recoveries).toHaveLength(1);
  });

  it("reclaims only the matching dead recovery lease after the final state was committed", async () => {
    const f = fixture(), claim = f.ops.claim;
    f.ops.claim = (expected, scope) => {
      const lease = claim(expected, scope);
      return Object.assign(async () => { throw new Error("Synthetic lease-release failure"); }, { lock: lease.lock, bind: lease.bind, assertHeld: lease.assertHeld });
    };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow("Synthetic lease-release failure");
    expect(f.state.session.phase).toBe("recovered"); expect(f.state.lease).not.toBeNull();
    f.state.snapshot = { boot: nextBoot, processes: [JSON.parse(f.state.lease!).process] };
    await expect(recoverSession(f.state.session, f.m, f.ops)).rejects.toMatchObject({ code: "PROCESS" });
    f.state.snapshot = { boot: nextBoot, processes: [] }; f.ops.claim = claim;
    const recovered = await recoverSession(f.state.session, f.m, f.ops);
    expect(recovered.recoveries).toHaveLength(1); expect(f.state.lease).toBeNull();
  });

  it("rejects a changed control file on retry rather than deleting its replacement", async () => {
    const f = fixture(), save = f.ops.save;
    f.ops.save = (value) => { if (value.phase === "recovered") throw new Error("Stop"); save(value); };
    await expect(recoverSession(f.s, f.m, f.ops)).rejects.toThrow();
    f.state.control = JSON.stringify({ databaseName: f.s.databaseName, sessionId: f.s.sessionId, runId: f.s.runId, pid: f.s.pid, port: 54321, key: "b".repeat(64) });
    await expect(recoverSession(f.state.session, f.m, f.ops)).rejects.toMatchObject({ code: "METADATA" });
  });

  it("proves a crashed recovery worker dead before reclaiming its precisely scoped lease", async () => {
    const f = fixture();
    f.lock.command = "manual-recover"; f.lock.pid = 500;
    f.lock.process = { ...identity(500, 99), started: "638900000050000000" };
    f.lock.scope!.recoveryId = "3".repeat(32); f.lock.scope!.sourceNonce = f.s.execution!.leaseNonce;
    f.state.lease = JSON.stringify(f.lock);
    await expect(recoverSession(f.s, f.m, f.ops)).resolves.toMatchObject({ phase: "recovered" });
    const live = fixture(); live.state.lease = JSON.stringify(f.lock); live.state.snapshot = { boot, processes: [f.lock.process] };
    await expect(recoverSession(live.s, live.m, live.ops)).rejects.toMatchObject({ code: "PROCESS" });
  });
});

describe("process incarnation validation", () => {
  it("does not confuse a reboot with the same PID or older creation timestamp", () => {
    const old = identity(100, 1);
    expect(() => assertProvenDead(old, { boot, processes: [old] })).toThrow();
    expect(() => assertProvenDead(old, { boot, processes: [{ ...old, started: "638900000000000001" }] })).toThrow();
    expect(() => assertProvenDead(old, { boot: nextBoot, processes: [{ ...old, boot: nextBoot, started: "638910000010000000" }] })).not.toThrow();
    expect(() => validateProcessIdentity({ ...old, executable: "relative.exe" })).toThrow();
    expect(() => validateProcessIdentity({ ...old, started: "missing" })).toThrow();
  });
});

describe("supervisor/child shutdown contract with simulated files and processes", () => {
  const ok = { requested: true, acknowledged: true, failed: false, code: 0 };
  it("retains control at the IPC-disconnect shutdown boundary, then recovers the persisted running run", async () => {
    const f = fixture(), before = structuredClone(f.state.rows), control = f.state.control;
    // Invoke the production retirement policy at the child shutdown boundary.
    const remove = vi.fn(() => { f.state.control = null; });
    retireChildControl(true, control!, { read: () => f.state.control, remove });
    expect(remove).not.toHaveBeenCalled();
    expect(f.state.session.phase).toBe("running");
    expect(f.state.control).toBe(control);
    f.state.snapshot = { boot, processes: [] };
    const recovered = await recoverSession(f.state.session, f.m, f.ops);
    expect(recovered.phase).toBe("recovered"); expect(f.state.control).toBeNull();
    expect(f.state.rows).toEqual(before);
    expect(recovered.recoveries).toHaveLength(1);
  });
  it("retires exact control only after normal acknowledged exit and durable stopping", () => {
    const f = fixture();
    f.state.session = { ...f.s, phase: "stopping" };
    const calls: string[] = [];
    const result = finishManualRun(f.state.session, f.state.control, ok, {
      assertLease: () => { calls.push("lease"); },
      readSession: () => { calls.push("persisted-stopping"); return f.state.session; },
      read: () => f.state.control,
      remove: () => { calls.push("remove"); f.state.control = null; },
    });
    expect(calls).toEqual(["lease", "persisted-stopping", "lease", "remove"]);
    expect(result).toMatchObject({ phase: "stopped", runId: null, execution: null });
  });
  it.each(["unrequested", "unacknowledged", "failed", "bad-exit"] as const)("preserves evidence on %s child exit", (reason) => {
    const f = fixture(), remove = vi.fn();
    const result = { ...ok, requested: reason !== "unrequested", acknowledged: reason !== "unacknowledged",
      failed: reason === "failed", code: reason === "bad-exit" ? 1 : 0 };
    const stopped = finishManualRun(f.s, f.state.control, result, {
      assertLease: vi.fn(), readSession: () => f.s, read: () => f.state.control, remove,
    });
    expect(stopped.phase).toBe("interrupted"); expect(stopped.execution).toEqual(f.s.execution);
    expect(remove).not.toHaveBeenCalled();
  });
  it.each(["still-running", "changed-session", "missing-control", "changed-control", "lost-lease", "unrecorded-control"] as const)(
    "refuses retirement with %s", (reason) => {
      const f = fixture(), stopping: ManualSession = { ...f.s, phase: "stopping" }, original = f.state.control, remove = vi.fn();
      if (reason === "missing-control") f.state.control = null;
      if (reason === "changed-control") f.state.control = original!.replace("a".repeat(64), "b".repeat(64));
      const persisted = reason === "still-running" ? f.s : reason === "changed-session" ? { ...stopping, runId: "0".repeat(32) } : stopping;
      expect(() => finishManualRun(stopping, reason === "unrecorded-control" ? null : original, ok, {
        assertLease: () => { if (reason === "lost-lease") throw new Error("Gate lost"); },
        readSession: () => persisted, read: () => f.state.control, remove,
      })).toThrow();
      expect(remove).not.toHaveBeenCalled();
    });
  it("recovers a supervisor crash after retirement but before saving stopped", async () => {
    const f = fixture(); f.state.session = { ...f.s, phase: "stopping" }; f.state.control = null;
    const recovered = await recoverSession(f.state.session, f.m, f.ops);
    expect(recovered.phase).toBe("recovered"); expect(recovered.recoveries?.[0].from).toBe("stopping");
  });
  it("preserves the ordinary browser runner's exact-control cleanup contract", () => {
    let current: string | null = "owned"; const remove = vi.fn(() => { current = null; });
    retireChildControl(false, "owned", { read: () => current, remove });
    expect(remove).toHaveBeenCalledOnce();
    current = "replacement";
    expect(() => retireChildControl(false, "owned", { read: () => current, remove })).toThrow();
    expect(current).toBe("replacement"); expect(remove).toHaveBeenCalledOnce();
  });
});
