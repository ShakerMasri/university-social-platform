// Test worker only. Every operational file lives in a serialized in-memory map.
// Fresh Node processes exercise the real recovery/writer with no QA runtime access.
import * as fs from "node:fs";
import { resolve, dirname, basename, sep } from "node:path";
import { mock } from "node:test";
import { URL } from "node:url";
import process from "node:process";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const files = new Map(input.files ?? []);
const root = resolve(".synthetic-recovery-memory-only");
const guard = (path) => {
  if (path !== root && !path.startsWith(root + sep)) throw new Error("TEST_OUTSIDE_VIRTUAL_ROOT");
};
let failRename = false;
const fsExports = { ...fs };
delete fsExports.default;
mock.module("node:fs", { namedExports: {
  ...fsExports,
  existsSync: (path) => { guard(path); return files.has(path); },
  readdirSync: (path) => { guard(path); return [...files.keys()].filter((p) => dirname(p) === path).map((p) => basename(p)); },
  renameSync: (from, to) => {
    guard(from); guard(to);
    if (failRename) throw new Error("SYNTHETIC_RENAME");
    if (!files.has(from)) throw new Error("TEST_MISSING_TEMP");
    files.set(to, files.get(from)); files.delete(from);
  },
} });
mock.module(new URL("./runtime-files.ts", import.meta.url), { namedExports: {
  runtimeDirectory: root, databaseDirectory: resolve(root, "m1b"), browserControlPath: resolve(root, "browser.json"),
  assertLocalPath: guard, assertPrivatePath: guard,
  powershellPath: () => { throw new Error("TEST_NATIVE_OPERATION_FORBIDDEN"); },
  readPrivateFile: (path) => { guard(path); if (!files.has(path)) throw new Error("TEST_MISSING_FILE"); return files.get(path); },
  writePrivateFile: (path, contents, initial) => {
    guard(path); if (initial && files.has(path)) throw new Error("TEST_EXISTING_FILE"); files.set(path, contents);
  },
} });
const { image } = await import("./targets.ts");
const { readManualSession, writeManualSession, manualControlPath } = await import("./manual-session.ts");
const { recoverSession } = await import("./manual-recovery.ts");
const owner = "abcdef123456", prefix = "usp_m1b_" + owner, project = "usp-m1b-" + owner;
const m = { version: 1, root: resolve("."), owner, project, container: project + "-postgres",
  dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine", containerId: "a".repeat(64),
  volume: project + "-data", image, port: 15432, migrationRole: prefix + "_migrate", migrationPassword: "b".repeat(64),
  runtimeRole: prefix + "_runtime", runtimePassword: "c".repeat(64),
  databases: [{ name: prefix + "_dev", kind: "development", ready: true }, { name: prefix + "_test_123456abcdef", kind: "test", ready: true }] };
const parent = { pid: 100, parentPid: 99, boot: "638900000000000000", started: "638900000010000000",
  executable: process.execPath, sid: "S-1-5-21-123" };
if (!input.files) {
  const s = { version: 1, root: m.root, owner, databaseName: m.databases[1].name, sessionId: "d".repeat(32),
    phase: "running", runId: "e".repeat(32), pid: 101,
    execution: { supervisor: parent, server: { ...parent, pid: 101, parentPid: 100, started: "638900000020000000" },
      leaseNonce: "f".repeat(32), controlPort: 54321 } };
  writeManualSession(s, m, true);
  files.set(manualControlPath, JSON.stringify({ port: 54321, key: "a".repeat(64), databaseName: s.databaseName,
    sessionId: s.sessionId, runId: s.runId, pid: s.pid }));
}
let error = null;
try {
  await recoverSession(readManualSession(m), m, {
    gate: { assertHeld() {}, async release() {} }, readSession: () => readManualSession(m),
    readControl: () => files.get(manualControlPath) ?? null, readLease: () => null,
    inspect: () => ({ boot: parent.boot, processes: [] }), ports: async () => {}, verify: async () => {},
    claim: () => Object.assign(async () => {}, { lock: null, bind() {}, assertHeld() {} }),
    save: (s) => { failRename = s.phase === input.failPhase; writeManualSession(s, m); },
    retireControl: (expected) => {
      if (files.get(manualControlPath) !== expected) throw new Error("TEST_CHANGED_CONTROL");
      files.delete(manualControlPath);
    },
  });
} catch (caught) { error = caught.message; }
process.stdout.write(JSON.stringify({ files: [...files], session: readManualSession(m), error, workerPid: process.pid }));
