import { manualPaths } from "./manual-paths";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { basename, dirname, resolve } from "node:path";
import { recoverSession, type RecoveryOperations } from "./manual-recovery";


import { manualPostgresPort as postgresHostPort } from "./manual-paths";
import { EventEmitter } from "node:events";
import { connect, type Socket } from "node:net";
import { image, type LocalManifest } from "./manual-targets";
import { acquireLifecycleLock, authorizeManualOperation, cleanupSession, newManualSession, prepareSession, stoppedSession, validateManualControl, validateManualSession, type ManualSession } from "./manual-session";
import { mailboxTokenResponse, requestManualToken, syntheticManualEmail } from "../identity/manual-mailbox";
import { acquireOperationGate } from "./lifecycle-lock";
import { readManualSession, writeManualSession } from "./manual-session";

// No PostgreSQL, filesystem resources, process launch, clipboard or network is
// touched by this suite. Real Windows ACL/IPC/cleanup checks remain separate gates.
const virtual = vi.hoisted(() => ({ files: new Map<string, string>(), links: new Set<string>(), gateBusy: false, renameFail: false }));
vi.mock("node:fs", async () => ({
  ...await vi.importActual<typeof import("node:fs")>("node:fs"),
  existsSync: (path: string) => virtual.files.has(String(path)) || virtual.links.has(String(path)),
  lstatSync: (path: string) => {
    if (!virtual.files.has(String(path)) && !virtual.links.has(String(path))) throw Object.assign(new Error("Synthetic absence"), { code: "ENOENT" });
    return { isSymbolicLink: () => virtual.links.has(String(path)), isDirectory: () => false, isFile: () => true };
  },
  mkdirSync: vi.fn(),
  readdirSync: (path: string) => [...virtual.files.keys(), ...virtual.links].filter((file) => dirname(file) === path).map((file) => basename(file)),
  writeFileSync: (path: string, data: string, options: { flag?: string }) => {
    if (options?.flag === "wx" && virtual.files.has(path)) throw new Error("Exists");
    virtual.files.set(path, data);
  },
  readFileSync: (path: string) => {
    if (!virtual.files.has(path)) throw new Error("Missing");
    return virtual.files.get(path)!;
  },
  unlinkSync: (path: string) => { virtual.files.delete(path); },
  renameSync: (from: string, to: string) => {
    if (virtual.renameFail) throw new Error("Synthetic atomic rename interruption");
    if (!virtual.files.has(from)) throw new Error("Missing temporary state");
    virtual.files.set(to, virtual.files.get(from)!); virtual.files.delete(from);
  },
}));
vi.mock("node:net", async () => ({ ...await vi.importActual<typeof import("node:net")>("node:net"), connect: vi.fn() }));
vi.mock("./windows-process.ts", async () => ({
  ...await vi.importActual<typeof import("./windows-process.ts")>("./windows-process.ts"),
  inspectProcesses: () => ({ boot: "638900000000000000", processes: [{ pid: process.pid, parentPid: 1, boot: "638900000000000000", started: "638900000010000000", executable: process.execPath, sid: "S-1-5-21-123" }] }),
}));
vi.mock("node:child_process", async () => ({
  ...await vi.importActual<typeof import("node:child_process")>("node:child_process"),
  spawn: vi.fn(() => {
    const child = new EventEmitter();
    const input = Object.assign(new EventEmitter(), {
      write: () => queueMicrotask(() => {
        if (virtual.gateBusy) child.emit("close", 1);
        else { virtual.gateBusy = true; output.emit("data", "held\n"); }
      }),
      end: () => queueMicrotask(() => { virtual.gateBusy = false; child.emit("close", 0); }), destroy: vi.fn(),
    });
    const output = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    return Object.assign(child, { stdin: input, stdout: output, kill: vi.fn() });
  }),
}));
// Lifecycle tests isolate the ACL adapter; runtime-files.test.ts exercises its policy/order.
vi.mock("./runtime-files.ts", async () => {
  const actual = await vi.importActual<typeof import("./runtime-files.ts")>("./runtime-files.ts");
  return { ...actual,
  assertPrivatePath: (path: string) => actual.assertLocalPath(path),
  readPrivateFile: (path: string) => {
    if (!virtual.files.has(path)) throw new Error("Missing");
    return virtual.files.get(path)!;
  },
  writePrivateFile: (path: string, contents: string, initial: boolean) => {
    if (initial && virtual.files.has(path)) throw new Error("Exists");
    virtual.files.set(path, contents);
  },
}; });

function fixture() {
  const owner = "abcdef123456", prefix = `usp_qa_${owner}`, project = `usp-qa-${owner}`;
  const manifest: LocalManifest = {
    version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
    dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    containerId: "a".repeat(64), volume: `${project}-data`, image, port: postgresHostPort,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
    runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }],
  };
  const session = newManualSession(manifest);
  manifest.databases.push({ name: session.databaseName, kind: "test", ready: true });
  return { manifest, session: { ...session, phase: "prepared" as const } };
}
const running = (s: ManualSession): ManualSession => ({ ...s, phase: "running", runId: "d".repeat(32), pid: 1234 });
const controlFor = (s: ManualSession) => ({ databaseName: s.databaseName, port: 54321, key: "e".repeat(64), sessionId: s.sessionId, runId: s.runId!, pid: s.pid! });

const originalPlatform = process.platform;
beforeEach(() => {
  vi.stubEnv("LOCALAPPDATA", resolve("synthetic-local-appdata"));
  Object.defineProperty(process, "platform", { value: "win32" });
  virtual.files.clear(); virtual.links.clear(); virtual.gateBusy = false; virtual.renameFail = false; vi.clearAllMocks();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); Object.defineProperty(process, "platform", { value: originalPlatform }); });

describe("manual QA target and lifecycle authorization", () => {
  it("reuses an exact complete temporary state after an interrupted atomic rename", () => {
    const { manifest: m, session: s } = fixture();
    writeManualSession(s, m, true);
    const next: ManualSession = { ...s, phase: "starting", runId: "a".repeat(32), pid: null };
    virtual.renameFail = true;
    expect(() => writeManualSession(next, m)).toThrow("Synthetic atomic rename interruption");
    expect(readManualSession(m).phase).toBe("prepared");
    virtual.renameFail = false;
    writeManualSession(next, m);
    expect(readManualSession(m).phase).toBe("starting");
    expect([...virtual.files.keys()]).toEqual([manualPaths.manualSessionPath]);
  });

  it("refuses a damaged temporary state while preserving the committed state", () => {
    const { manifest: m, session: s } = fixture();
    writeManualSession(s, m, true);
    const next: ManualSession = { ...s, phase: "starting", runId: "a".repeat(32), pid: null };
    virtual.renameFail = true;
    expect(() => writeManualSession(next, m)).toThrow();
    const temporary = [...virtual.files.keys()].find((path) => path !== manualPaths.manualSessionPath)!;
    virtual.files.set(temporary, "truncated synthetic write"); virtual.renameFail = false;
    expect(() => writeManualSession(next, m)).toThrow("Incomplete session write");
    expect(readManualSession(m).phase).toBe("prepared");
  });

  it("fences simultaneous recovery attempts and start with the same live OS gate", async () => {
    const recovery = await acquireOperationGate();
    await expect(acquireOperationGate()).rejects.toThrow("busy or unavailable");
    await expect(acquireLifecycleLock("manual-start")).rejects.toThrow();
    await recovery.release();
    const retry = await acquireOperationGate(); await retry.release();
  });
  it("refuses development, foreign roots/owners, unregistered and non-ready targets", () => {
    const { manifest: m, session: s } = fixture();
    for (const changed of [{ ...s, databaseName: m.databases[0].name }, { ...s, root: resolve("..") },
      { ...s, owner: "000000000000" }, { ...s, databaseName: `usp_qa_${m.owner}_test_000000000000` }]) {
      expect(() => authorizeManualOperation(changed, m, "cleanup")).toThrow();
    }
    m.databases[1].ready = false;
    expect(() => authorizeManualOperation(s, m, "start")).toThrow();
  });

  it("requires stopped/prepared state for start and cleanup, and running state for tokens", () => {
    const { manifest: m, session: s } = fixture();
    expect(authorizeManualOperation(s, m, "start").name).toBe(s.databaseName);
    expect(() => authorizeManualOperation(s, m, "token")).toThrow();
    expect(authorizeManualOperation(running(s), m, "token").name).toBe(s.databaseName);
    for (const phase of ["preparing", "starting", "running", "stopping", "interrupted", "cleaning"] as const) {
      const state = { ...running(s), phase };
      expect(() => authorizeManualOperation(state, m, "cleanup")).toThrow();
      expect(() => authorizeManualOperation(state, m, "start")).toThrow();
    }
    expect(() => validateManualSession({ ...s, pid: 1234 }, m)).toThrow();
    expect(() => validateManualSession({ ...s, unexpected: true }, m)).toThrow();
  });

  it("isolates control records across sessions, restarts, processes and databases", () => {
    const { session } = fixture(), s = running(session), c = controlFor(s);
    expect(validateManualControl(c, s)).toEqual(c);
    for (const changed of [{ ...c, sessionId: "0".repeat(32) }, { ...c, runId: "0".repeat(32) },
      { ...c, pid: 4321 }, { ...c, databaseName: "shared" }, { ...c, port: 0 },
      { ...c, port: 70000 }, { ...c, key: "bad" }, { ...c, host: "remote.test" }]) {
      expect(() => validateManualControl(changed, s)).toThrow();
    }
  });

  it("marks preparation ready only after registration, creation, migration and identity verification", async () => {
    const { session } = fixture(), s: ManualSession = { ...session, phase: "preparing" };
    const calls: string[] = [];
    await prepareSession(s, {
      register: () => { calls.push("register"); }, create: async () => { calls.push("create"); },
      migrate: async () => { calls.push("migrate"); }, verify: async () => { calls.push("verify"); },
      save: (value) => { calls.push(value.phase); },
    });
    expect(calls).toEqual(["register", "create", "migrate", "verify", "prepared"]);
  });

  it.each(["register", "create", "migrate", "verify"])("retains interrupted preparation when %s fails, without cleanup", async (failure) => {
    const { session } = fixture(), calls: string[] = [], states: ManualSession[] = [];
    const action = (name: string) => { calls.push(name); if (name === failure) throw new Error("Sensitive driver detail"); };
    await expect(prepareSession({ ...session, phase: "preparing" }, {
      register: () => action("register"), create: async () => action("create"),
      migrate: async () => action("migrate"), verify: async () => action("verify"), save: (s) => { states.push(s); },
    })).rejects.toThrow("retained resources require inspection");
    expect(calls.at(-1)).toBe(failure);
    expect(states.map((s) => s.phase)).toEqual(["interrupted"]);
  });

  it("does not label unacknowledged or unsuccessful shutdown as stopped", () => {
    const { manifest: m, session } = fixture(), s = running(session);
    for (const [ack, code] of [[false, 0], [true, 1], [false, null]] as const) {
      const interrupted = stoppedSession(s, ack, code);
      expect(interrupted.phase).toBe("interrupted");
      expect(interrupted.runId).toBe(s.runId);
      expect(() => authorizeManualOperation(interrupted, m, "cleanup")).toThrow();
    }
    const stopped = stoppedSession(s, true, 0);
    expect(stopped).toMatchObject({ phase: "stopped", runId: null, pid: null });
    expect(authorizeManualOperation(stopped, m, "cleanup").name).toBe(s.databaseName);
  });

  it("cleans only the session's registered test target, after verification", async () => {
    const { manifest: m, session: s } = fixture();
    const unrelated = { ...m.databases[1], name: `usp_qa_${m.owner}_test_000000000000` };
    m.databases.push(unrelated);
    const calls: string[] = [];
    await cleanupSession(s, m, {
      controlExists: () => false, verify: async () => { calls.push("verify"); },
      save: (value) => { calls.push(value.phase); }, drop: async (record) => {
        expect(record).toBe(m.databases[1]); calls.push("drop"); m.databases.splice(1, 1);
      }, forget: () => { calls.push("forget"); },
    });
    expect(calls).toEqual(["verify", "cleaning", "drop", "forget"]);
    expect(m.databases.map((r) => r.kind)).toEqual(["development", "test"]);
    expect(m.databases[1]).toBe(unrelated);
  });

  it("refuses control residue and failed identity verification before dropping anything", async () => {
    const { manifest: m, session: s } = fixture(), drop = vi.fn(), save = vi.fn(), forget = vi.fn();
    await expect(cleanupSession(s, m, { controlExists: () => true, verify: vi.fn(), drop, save, forget })).rejects.toThrow();
    await expect(cleanupSession(s, m, { controlExists: () => false, verify: async () => { throw new Error("Marker mismatch"); }, drop, save, forget })).rejects.toThrow();
    expect(drop).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(forget).not.toHaveBeenCalled();
  });

  it("retains cleaning state and session evidence when narrow DROP fails", async () => {
    const { manifest: m, session: s } = fixture(), states: string[] = [], forget = vi.fn();
    await expect(cleanupSession(s, m, {
      controlExists: () => false, verify: async () => {}, save: (value) => { states.push(value.phase); },
      drop: async () => { throw new Error("Lingering connection"); }, forget,
    })).rejects.toThrow();
    expect(states).toEqual(["cleaning"]); expect(forget).not.toHaveBeenCalled();
  });

  it("excludes concurrent resource operations and never reclaims a stale lock", async () => {
    const release = await acquireLifecycleLock("manual-start");
    await expect(acquireLifecycleLock("test")).rejects.toThrow();
    await expect(acquireLifecycleLock("cleanup")).rejects.toThrow();
    await release();
    const next = await acquireLifecycleLock("manual-cleanup"); await next();
    virtual.files.set(manualPaths.lifecycleLockPath, '{"pid":99999999}');
    await expect(acquireLifecycleLock("setup")).rejects.toThrow();
  });

  it("refuses to remove another owner's lock or follow an operational symlink", async () => {
    const release = await acquireLifecycleLock("manual-start");
    virtual.files.set(manualPaths.lifecycleLockPath, "replacement");
    expect(() => release.assertHeld()).toThrow("ownership changed");
    await expect(release()).rejects.toThrow();
    expect(virtual.files.get(manualPaths.lifecycleLockPath)).toBe("replacement");
    virtual.files.clear(); virtual.links.add(manualPaths.runtimeDirectory);
    await expect(acquireLifecycleLock("cleanup")).rejects.toThrow();
  });
});

class SyntheticSocket extends EventEmitter {
  write = vi.fn();
  destroy = vi.fn(() => { this.emit("close"); return this; });
}
describe("bounded private manual mailbox", () => {
  it("allows only one normalized synthetic address, not real university domains or suffix lookalikes", () => {
    expect(syntheticManualEmail(" QA.A@UNIVERSITY.TEST ")).toBe("qa.a@university.test");
    for (const value of ["a@najah.edu", "a@sub.university.test", "a@university.test.evil.test", "a@university.test,b@university.test", ["a@university.test"], null]) {
      expect(() => syntheticManualEmail(value)).toThrow();
    }
  });

  it("accepts only the minimal token response and omits untrusted diagnostic content", () => {
    expect(mailboxTokenResponse(JSON.stringify({ token: "x".repeat(43) }))).toHaveLength(43);
    for (const response of ["{}", "[]", "null", '{"token":"bad"}', '{"token":"secret diagnostic"}', '{"token":"x","extra":true}', "not JSON"]) {
      expect(() => mailboxTokenResponse(response)).toThrow("credentials omitted");
    }
  });

  it("uses only loopback, newline JSON, and a bounded response without exposing the key", async () => {
    const socket = new SyntheticSocket(); vi.mocked(connect).mockReturnValue(socket as unknown as Socket);
    const control = controlFor(running(fixture().session));
    const received = requestManualToken(control, "qa.a@university.test");
    socket.emit("connect");
    expect(connect).toHaveBeenCalledWith({ host: "127.0.0.1", port: control.port });
    expect(socket.write).toHaveBeenCalledWith(JSON.stringify({ key: control.key, email: "qa.a@university.test" }) + "\n");
    socket.emit("data", Buffer.from(JSON.stringify({ token: "x".repeat(43) }) + "\n")); socket.emit("end");
    await expect(received).resolves.toHaveLength(43); expect(socket.destroy).toHaveBeenCalled();
  });

  it.each(["oversize", "timeout", "socket-error"])("rejects %s with redacted errors and closes only its socket", async (failure) => {
    vi.useFakeTimers();
    const socket = new SyntheticSocket(); vi.mocked(connect).mockReturnValue(socket as unknown as Socket);
    const received = requestManualToken(controlFor(running(fixture().session)), "qa.a@university.test");
    const rejected = expect(received).rejects.toThrow("credentials omitted");
    if (failure === "oversize") socket.emit("data", Buffer.alloc(1025));
    else if (failure === "timeout") await vi.advanceTimersByTimeAsync(3001);
    else socket.emit("error", new Error("Sensitive data"));
    await rejected; expect(socket.destroy).toHaveBeenCalled();
  });
});

describe("atomic recovery writes across a fresh recovery invocation (virtual disk)", () => {
  function diskFixture() {
    const { manifest: m, session: prepared } = fixture();
    const supervisor = { pid: 100, parentPid: 99, boot: "638900000000000000", started: "638900000010000000",
      executable: process.execPath, sid: "S-1-5-21-123" };
    const s: ManualSession = { ...prepared, phase: "running", runId: "a".repeat(32), pid: 101,
      execution: { supervisor, server: { ...supervisor, pid: 101, parentPid: 100, started: "638900000020000000" },
        leaseNonce: "b".repeat(32), controlPort: 54321 } };
    writeManualSession(s, m, true);
    virtual.files.set(manualPaths.manualControlPath, JSON.stringify(controlFor(s)));
    // New ops and a new state read on every invocation: no retained journal in memory.
    const operations = (): RecoveryOperations => ({
      gate: { assertHeld: vi.fn(), release: vi.fn(async () => {}) },
      readSession: () => readManualSession(m), readControl: () => virtual.files.get(manualPaths.manualControlPath) ?? null,
      readLease: () => null, inspect: () => ({ boot: supervisor.boot, processes: [] }),
      ports: async () => {}, verify: async () => {},
      claim: () => Object.assign(async () => {}, { lock: null, bind: vi.fn(), assertHeld: vi.fn() }),
      save: (value) => writeManualSession(value, m),
      retireControl: (expected) => {
        expect(virtual.files.get(manualPaths.manualControlPath)).toBe(expected); virtual.files.delete(manualPaths.manualControlPath);
      },
    });
    return { m, s, operations };
  }
  it("refuses a newly generated journal after first-write rename interruption and preserves all evidence", async () => {
    const f = diskFixture(), control = virtual.files.get(manualPaths.manualControlPath);
    virtual.renameFail = true;
    await expect(recoverSession(readManualSession(f.m), f.m, f.operations())).rejects.toThrow("rename interruption");
    virtual.renameFail = false;
    const files = new Map(virtual.files);
    await expect(recoverSession(readManualSession(f.m), f.m, f.operations())).rejects.toThrow("Ambiguous session write");
    expect(virtual.files).toEqual(files);
    expect(readManualSession(f.m).phase).toBe("running");
    expect(virtual.files.get(manualPaths.manualControlPath)).toBe(control);
  });
  it("retries the exact final write from the committed journal without duplicating history", async () => {
    const f = diskFixture(), first = f.operations(), save = first.save;
    first.save = (value) => { virtual.renameFail = value.phase === "recovered"; save(value); };
    await expect(recoverSession(readManualSession(f.m), f.m, first)).rejects.toThrow("rename interruption");
    const pending = readManualSession(f.m);
    expect(pending.phase).toBe("recovering"); expect(virtual.files.has(manualPaths.manualControlPath)).toBe(false);
    virtual.renameFail = false;
    const recovered = await recoverSession(readManualSession(f.m), f.m, f.operations());
    expect(recovered.phase).toBe("recovered"); expect(recovered.recoveries).toEqual(pending.recoveries);
    expect([...virtual.files.keys()]).toEqual([manualPaths.manualSessionPath]);
    expect(await recoverSession(readManualSession(f.m), f.m, f.operations())).toEqual(recovered);
  });
  it.each(["session.next.json", "session.next-foreign.json", "session.next-incomplete.json"])("preserves ambiguous residue %s", (name) => {
    const f = diskFixture(), path = resolve(dirname(manualPaths.manualSessionPath), name);
    virtual.files.set(path, "synthetic incomplete journal");
    const files = new Map(virtual.files);
    expect(() => writeManualSession({ ...f.s, phase: "stopping" }, f.m)).toThrow("Ambiguous session write");
    expect(virtual.files).toEqual(files);
  });
});

it("refuses new session creation over uncommitted residue and preserves it", () => {
  const { manifest, session } = fixture();
  const residue = resolve(dirname(manualPaths.manualSessionPath), "session.next-incomplete.json");
  virtual.files.set(residue, "synthetic interrupted write");
  expect(() => writeManualSession(session, manifest, true)).toThrow("Ambiguous session write");
  expect(virtual.files.has(manualPaths.manualSessionPath)).toBe(false);
  expect(virtual.files.get(residue)).toBe("synthetic interrupted write");
});
