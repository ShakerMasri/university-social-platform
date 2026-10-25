import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { inspectLegacyRuntime, legacyMarkerNames } from "./legacy-runtime";
type Meta = { mode: number; uid: number; isSymbolicLink: () => boolean; isDirectory: () => boolean; isFile: () => boolean };
const directory = (mode = 0o700, uid = 1000): Meta => ({ mode, uid, isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false });
const file = (): Meta => ({ ...directory(0o600), isDirectory: () => false, isFile: () => true });
const root = resolve("synthetic-legacy-checkout"), cache = resolve(root, ".cache");
function fixture() {
  const metadata = new Map<string, Meta>(), bodies = new Map<string, string>();
  const inspect = vi.fn((path: string) => {
    if (!metadata.has(path)) throw Object.assign(new Error("Synthetic absent metadata"), { code: "ENOENT" });
    return metadata.get(path)!;
  });
  return { metadata, bodies, inspect };
}
describe("legacy Windows decision C: preserve evidence, metadata-only guidance, no migration", () => {
  it("allows fresh installations without assuming any process/resource state", () => {
    const f = fixture(), report = inspectLegacyRuntime(root, "win32", f.inspect);
    expect(report).toEqual({ status: "clear", markers: [], lifecycleEvidence: "not-inspected", transition: "not-implemented" });
  });
  it("does not classify the supported POSIX .cache layout as obsolete", () => {
    const f = fixture(); f.metadata.set(cache, directory(0o755));
    f.metadata.set(resolve(cache, "m1b"), directory());
    expect(inspectLegacyRuntime(root, "linux", f.inspect, 1000).status).toBe("clear");
    expect(f.inspect).toHaveBeenCalledTimes(3);
  });
  it.each([55432, 15432, 15433])("preserves legacy development metadata and recorded port %s without reading credentials", (port) => {
    const f = fixture(); f.metadata.set(cache, directory()); f.metadata.set(resolve(cache, "m1b"), directory());
    f.bodies.set(resolve(cache, "m1b/manifest.json"), JSON.stringify({ port, runtimePassword: "SYNTHETIC_PRIVATE" }));
    const before = new Map(f.bodies), report = inspectLegacyRuntime(root, "win32", f.inspect);
    expect(report.status).toBe("review-required"); expect(report.transition).toBe("not-implemented");
    expect(f.bodies).toEqual(before);
  });
  it.each(["running", "stopped", "interrupted", "malformed", "unknown-process", "PID-reused", "foreign-Docker", "invalid-ACL", "interrupted-migration"])(
    "never infers authorization/termination from legacy %s", (phase) => {
      const f = fixture(); f.metadata.set(cache, directory()); f.metadata.set(resolve(cache, "manual-identity"), directory());
      f.bodies.set(resolve(cache, "manual-identity/session.json"), phase);
      const before = new Map(f.bodies);
      const first = inspectLegacyRuntime(root, "win32", f.inspect), retry = inspectLegacyRuntime(root, "win32", f.inspect);
      expect(first.status).toBe("review-required"); expect(first.lifecycleEvidence).toBe("not-inspected");
      expect(first.transition).toBe("not-implemented"); expect(retry).toEqual(first);
      expect(f.bodies).toEqual(before);
      expect(f.inspect.mock.calls.map(([path]) => path)).not.toContain(resolve(cache, "manual-identity/session.json"));
    });
  it("does not traverse symlinked legacy parents", () => {
    const f = fixture(); f.metadata.set(cache, { ...directory(), isSymbolicLink: () => true });
    expect(inspectLegacyRuntime(root, "win32", f.inspect).markers).toEqual([{ name: ".cache", kind: "link" }]);
    expect(f.inspect).toHaveBeenCalledTimes(1);
  });
  it.each(["EACCES", "ENOTDIR", "EIO"])("preserves ambiguous metadata on %s instead of treating it as absent", (code) => {
    const inspect = () => { throw Object.assign(new Error("SYNTHETIC_PRIVATE"), { code }); };
    const report = inspectLegacyRuntime(root, "win32", inspect);
    expect(report.status).toBe("review-required"); expect(JSON.stringify(report)).not.toContain("SYNTHETIC_PRIVATE");
  });
  it("reports every known marker without touching unrelated resources or evidence", () => {
    const f = fixture(); f.metadata.set(cache, directory());
    for (const name of legacyMarkerNames) f.metadata.set(resolve(cache, name), file());
    f.bodies.set(resolve(cache, "unrelated-project"), "UNTOUCHED");
    const before = new Map(f.bodies), report = inspectLegacyRuntime(root, "win32", f.inspect);
    expect(report.markers.map((m) => m.name)).toEqual([...legacyMarkerNames]); expect(f.bodies).toEqual(before);
  });
});

describe("POSIX compatibility metadata (no permission repair or content access)", () => {
  it.each(["m1b", "manual-identity"])("detects historical 0755 %s and preserves synthetic manifests on repeat inspection", (name) => {
    const f = fixture(); f.metadata.set(cache, directory(0o755));
    f.metadata.set(resolve(cache, name), directory(0o755));
    f.bodies.set(resolve(cache, name, "manifest.json"), "SYNTHETIC_PRIVATE");
    const before = new Map(f.bodies), metadataBefore = new Map(f.metadata);
    const report = inspectLegacyRuntime(root, "linux", f.inspect, 1000);
    expect(report.status).toBe("review-required");
    expect(report.markers).toEqual([{ name, kind: "directory", reason: "permissions-or-owner" }]);
    expect(inspectLegacyRuntime(root, "linux", f.inspect, 1000)).toEqual(report);
    expect(f.metadata).toEqual(metadataBefore); expect(f.bodies).toEqual(before);
    expect(f.inspect.mock.calls.every(([path]) => [cache, resolve(cache, "m1b"), resolve(cache, "manual-identity")].includes(path))).toBe(true);
    expect(JSON.stringify(report)).not.toContain("SYNTHETIC_PRIVATE");
  });
  it.each(["writable", "foreign-owner", "link", "file", "unreadable"])("refuses %s cache metadata without traversing it", (reason) => {
    const f = fixture();
    f.metadata.set(cache, reason === "file" ? file() : { ...directory(reason === "writable" ? 0o777 : 0o755, reason === "foreign-owner" ? 2000 : 1000), isSymbolicLink: () => reason === "link" });
    const inspect = reason === "unreadable" ? vi.fn(() => { throw Object.assign(new Error("SYNTHETIC_PRIVATE"), { code: "EACCES" }); }) : f.inspect;
    expect(inspectLegacyRuntime(root, "linux", inspect, 1000).status).toBe("review-required");
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it("reports a fresh POSIX checkout as clear without claiming resource or lifecycle verification", () => {
    const f = fixture(), report = inspectLegacyRuntime(root, "linux", f.inspect, 1000);
    expect(report).toEqual({ status: "clear", markers: [], lifecycleEvidence: "not-inspected", transition: "not-implemented" });
  });
});

describe("metadata-only compatibility CLI contract in fresh mocked native processes", () => {
  it.each(["clear", "legacy", "unreadable", "arguments", "posix-0755", "posix-private"])("reports %s without reading contents or mutating files", (scenario) => {
    const script = `
      import {mock} from "node:test";
      import * as fs from "node:fs";
      import {resolve} from "node:path";
      const scenario = process.env.USP_SYNTHETIC_COMPATIBILITY_CASE;
      if (scenario.startsWith("posix-")) {
        Object.defineProperty(process, "platform", {value:"linux"});
        process.getuid = () => 1000;
      }
      const exports = {...fs}; delete exports.default;
      const blocked = () => { throw new Error("TEST_PRIVATE_OPERATION_FORBIDDEN"); };
      mock.module("node:fs", {namedExports:{...exports,
        lstatSync(path) {
          if (scenario === "unreadable") throw Object.assign(new Error("SYNTHETIC_PRIVATE"), {code:"EACCES"});
          if (scenario.startsWith("posix-") && [resolve(".cache"),resolve(".cache/m1b")].includes(path)) {
            return {mode: scenario === "posix-private" && path === resolve(".cache/m1b") ? 0o700 : 0o755, uid:1000,
              isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
          }
          if (scenario === "legacy" && [resolve(".cache"),resolve(".cache/m1b")].includes(path)) {
            return {mode:0o700,uid:process.getuid?.(),isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
          }
          throw Object.assign(new Error("Synthetic absent"), {code:"ENOENT"});
        },
        readFileSync:blocked,writeFileSync:blocked,mkdirSync:blocked,renameSync:blocked,unlinkSync:blocked
      }});
      process.argv = [process.execPath,"tools/database/compatibility.mts",...(scenario === "arguments" ? ["--force"] : [])];
      await import("./tools/database/compatibility.mts");
    `;
    const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module"], {
      input: script, encoding: "utf8", windowsHide: true, timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: "", USP_SYNTHETIC_COMPATIBILITY_CASE: scenario },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(scenario === "arguments" ? 1 : ["clear", "posix-private"].includes(scenario) ||
      (scenario === "legacy" && process.platform !== "win32") ? 0 : 2);
    expect(result.stdout + result.stderr).not.toContain("SYNTHETIC_PRIVATE");
    expect(result.stdout + result.stderr).not.toContain("TEST_PRIVATE_OPERATION_FORBIDDEN");
    if (scenario === "arguments") expect(result.stderr).toContain("COMPATIBILITY_INSPECTION");
    else {
      const report = JSON.parse(result.stdout) as { transition: string; lifecycleEvidence: string };
      expect(report.transition).toBe("not-implemented"); expect(report.lifecycleEvidence).toBe("not-inspected");
    }
  });
});
