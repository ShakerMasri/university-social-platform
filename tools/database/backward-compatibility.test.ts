import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { image, validateManifest, validateTarget, databaseUrl, type LocalManifest } from "./targets";
import { validateManifest as validateManual, validateTarget as validateManualTarget } from "./manual-targets";
import { manualPaths, manualHttpPort, manualPostgresPort } from "./manual-paths";

const importDeadlineMs = 15000;
const reapDeadlineMs = 1000;
// Preserve the existing native-child allowance; leave room to reap it before
// Vitest's outer deadline. This verifies compatibility, not a 5s performance SLA.
const importTestTimeoutMs = importDeadlineMs + reapDeadlineMs + 2000;
type ProbeFailure = "spawn" | "input" | "timeout" | "cancelled" | "output" | "exit" | "signal" | "termination-unconfirmed";
function nativeProbe(program: string, signal: AbortSignal, deadlineMs = importDeadlineMs, executable = process.execPath) {
  return new Promise<{ failure: ProbeFailure | null; code: number | null; closed: boolean; stdout: string; elapsedMs: number;
    spawnMs: number | null; firstOutputMs: number | null; lastOutputMs: number | null }>((accept) => {
    const started = performance.now();
    const child = spawn(executable, ["--input-type=module"], {
      windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_OPTIONS: "" },
    });
    let failure: ProbeFailure | null = null, stdout = "", bytes = 0, finished = false;
    let spawnMs: number | null = null, firstOutputMs: number | null = null, lastOutputMs: number | null = null;
    let reapTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (closed: boolean, code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(reapTimer); signal.removeEventListener("abort", cancel);
      accept({ failure, code, closed, stdout, elapsedMs: Math.round(performance.now() - started), spawnMs, firstOutputMs, lastOutputMs });
    };
    const stop = (reason: ProbeFailure) => {
      if (failure || finished) return;
      failure = reason;
      // Direct, owned Node child only, with no shell or descendant processes.
      // Windows implements SIGKILL as forced process termination.
      try { child.kill("SIGKILL"); } catch { /* Reaping must still be confirmed. */ }
      reapTimer = setTimeout(() => { failure = "termination-unconfirmed"; finish(false, null); }, reapDeadlineMs);
    };
    const cancel = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), deadlineMs);
    signal.addEventListener("abort", cancel, { once: true });
    child.once("spawn", () => { spawnMs = Math.round(performance.now() - started); });
    child.on("error", () => stop("spawn"));
    child.stdin.on("error", () => stop("input"));
    for (const [stream, capture] of [[child.stdout, true], [child.stderr, false]] as const) stream.on("data", (chunk: Buffer) => {
      lastOutputMs = Math.round(performance.now() - started);
      firstOutputMs ??= lastOutputMs;
      bytes += chunk.length;
      if (bytes > 16384) { stop("output"); return; }
      if (capture) stdout += chunk.toString("utf8"); // Never retain or print provider stderr.
    });
    child.once("close", (code, terminated) => {
      failure ??= terminated ? "signal" : code === 0 ? null : "exit";
      finish(true, code); // Resolve only after process exit AND stdio closure.
    });
    if (signal.aborted) cancel();
    else child.stdin.end(program);
  });
}

type Evidence = { exit: number; events: unknown[][]; logs: string[]; errors: string[] };
function traditional(command: string, mode = 0o755): Evidence {
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "tools/database/backward-compatibility.fixture.mjs"], {
    input: JSON.stringify({ command, mode }), encoding: "utf8", timeout: 15000, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Evidence;
}
function fixture(qa: boolean): LocalManifest {
  const owner = "abcdef123456", prefix = `${qa ? "usp_qa" : "usp_m1b"}_${owner}`;
  const project = `${qa ? "usp-qa" : "usp-m1b"}-${owner}`;
  return { version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
    dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    containerId: "a".repeat(64), volume: `${project}-data`, port: qa ? manualPostgresPort : 55432, image,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
    runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }],
  };
}

describe("traditional current-main contracts, virtual resources only", () => {
  it.each([0o755, 0o700])("reads the established manifest and reaches owned status with historical mode %s and no QA environment", (mode) => {
    const evidence = traditional("status", mode);
    expect(evidence.exit).toBe(0);
    expect(evidence.logs.join("\n")).toContain("Owned local PostgreSQL");
    expect(evidence.events.filter(([event]) => event === "read").map(([, path]) => path)).toEqual([
      resolve("package.json"), resolve(".cache/m1b/manifest.json"),
    ]);
    expect(evidence.events.filter(([event]) => event === "process").every(([, command]) => command === "docker")).toBe(true);
    expect(evidence.errors).toEqual([]);
  });
  it.each(["setup", "review", "migrate", "test", "guard-check", "cleanup", "identity-browser"])(
    "%s is not blocked by QA configuration or stale leases before its existing Docker boundary", (command) => {
      const evidence = traditional(command);
      expect(evidence.exit).toBe(1); // Deliberately paused by the synthetic Docker adapter.
      expect(evidence.events.filter(([event]) => event === "process")).toEqual([["process", "docker", ["context", "show"]]]);
      expect(evidence.events.filter(([event]) => event === "stat")).toEqual([]);
      expect(JSON.stringify(evidence)).not.toMatch(/QA_CONFIGURATION|QA_NATIVE|WRITE_FORBIDDEN/);
      expect(evidence.errors.join("\n")).toContain("[DATABASE]");
    });
  it("keeps existing package commands and routes Manual QA through its separate entrypoint", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    for (const [name, command] of Object.entries({
      "db:setup": "setup", "db:status": "status", "db:review": "review", "db:migrate": "migrate",
      "db:test": "test", "db:guard-check": "guard-check", "db:cleanup": "cleanup", "test:e2e:identity": "identity-browser",
    })) expect(pkg.scripts[name]).toBe(`node tools/database/local.mts ${command}`);
    for (const name of ["prepare", "start", "status", "token", "cleanup", "recover"])
      expect(pkg.scripts[`manual:${name}`]).toBe(`node tools/database/manual.mts manual-${name}`);
  });
  it("loads ordinary Prisma config and QA libraries with no LOCALAPPDATA, but refuses QA path use", { timeout: importTestTimeoutMs }, async ({ signal }) => {
    const result = await nativeProbe(`import assert from "node:assert/strict";
        const started = performance.now();
        const mark = (stage) => process.stdout.write(JSON.stringify({stage, ms: Math.round(performance.now()-started)}) + String.fromCharCode(10));
        delete process.env.LOCALAPPDATA; delete process.env.M1B_MIGRATION_URL; delete process.env.USP_MANUAL_BUILD;
        assert.equal(process.env.LOCALAPPDATA, undefined);
        assert.notEqual(process.pid, ${process.pid});
        mark("started");
        await import("./prisma.config.ts");
        mark("prisma");
        await import("./prisma.manual.config.ts");
        mark("qa-prisma");
        const {manualPaths} = await import("./tools/database/manual-paths.ts");
        await import("./tools/database/manual-recovery.ts");
        mark("qa-recovery");
        const {default:config} = await import("./next.config.ts");
        mark("next");
        assert.equal(config.distDir,undefined);
        if(process.platform === "win32") assert.throws(()=>manualPaths.runtimeDirectory,/unavailable/);
        mark("assertions");
        process.stdout.write("IMPORTS_WITHOUT_QA_ENV_OK",()=>process.exit(0));`, signal);
    // Failure messages contain only fixed stages and numeric timings, never
    // raw stdout/stderr, environment values, connection errors or private paths.
    const stages = ["started", "prisma", "qa-prisma", "qa-recovery", "next", "assertions"];
    const lines = result.stdout.split("\n"), marker = lines.pop();
    const timings: { stage: string; ms: number }[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry && stages.includes(entry.stage) && Number.isSafeInteger(entry.ms) && entry.ms >= 0) timings.push({ stage: entry.stage, ms: entry.ms });
      } catch { /* Invalid output fails the exact protocol assertion below. */ }
    }
    const diagnostic = JSON.stringify({ failure: result.failure, code: result.code, closed: result.closed,
      elapsedMs: result.elapsedMs, spawnMs: result.spawnMs, firstOutputMs: result.firstOutputMs, lastOutputMs: result.lastOutputMs, timings });
    // Keep timing evidence for cold-process runs, including any slow success.
    console.info("Native import probe " + diagnostic);
    expect(result.failure, diagnostic).toBeNull(); expect(result.closed, diagnostic).toBe(true);
    expect(result.code, diagnostic).toBe(0); expect(lines.length, diagnostic).toBe(stages.length);
    expect(timings.map((entry) => entry.stage), diagnostic).toEqual(stages);
    expect(marker === "IMPORTS_WITHOUT_QA_ENV_OK", diagnostic).toBe(true);
  });
  it("fails a QA invocation without its environment before any resource operation and without a raw stack", () => {
    const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module"], {
      input: `import {mock} from "node:test";
        import * as fs from "node:fs"; import * as cp from "node:child_process";
        delete process.env.LOCALAPPDATA; let operations=0;
        const blocked=()=>{operations++;throw Error("SYNTHETIC_RESOURCE_FORBIDDEN");};
        const f={...fs};delete f.default;const c={...cp};delete c.default;
        mock.module("node:fs",{namedExports:{...f,readFileSync:blocked,lstatSync:blocked,writeFileSync:blocked,mkdirSync:blocked}});
        mock.module("node:child_process",{namedExports:{...c,spawn:blocked,spawnSync:blocked}});
        mock.module("pg",{namedExports:{Client:class {}}});
        process.argv=[process.execPath,"tools/database/manual.mts","manual-status"];
        await import("./tools/database/manual.mts");
        process.stdout.write("RESOURCE_OPERATIONS="+operations);`,
      encoding: "utf8", timeout: 15000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: "" },
    });
    expect(result.status).toBe(1); expect(result.stdout).toBe("RESOURCE_OPERATIONS=0");
    expect(result.stderr).toContain("[MANUAL]");
    expect(result.stderr).not.toMatch(/file:|SYNTHETIC_RESOURCE_FORBIDDEN|\n\s+at\s/);
  });
});

describe("bounded native import probe failures", () => {
  it("reports a spawn failure without raw provider diagnostics", async ({ signal }) => {
    const result = await nativeProbe("", signal, 1000, resolve("synthetic-missing-node.exe"));
    expect(result.failure).toBe("spawn"); expect(result.closed).toBe(true);
  });
  it("rejects a nonzero child exit even if it prints a success marker", async ({ signal }) => {
    const result = await nativeProbe('process.stdout.write("IMPORTS_WITHOUT_QA_ENV_OK");process.exitCode=7;', signal);
    expect(result.failure).toBe("exit"); expect(result.code).toBe(7); expect(result.closed).toBe(true);
  });
  for (const stream of ["stdout", "stderr"]) it(`terminates and reaps a child exceeding the shared ${stream} limit`, async ({ signal }) => {
    const result = await nativeProbe(`process.${stream}.write("x".repeat(32768));setInterval(()=>{},1000);`, signal);
    expect(result.failure).toBe("output"); expect(result.closed).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(16384);
  });
  it("terminates and reaps a hung child at its own deadline", async ({ signal }) => {
    const result = await nativeProbe("setInterval(()=>{},1000);", signal, 100);
    expect(result.failure).toBe("timeout"); expect(result.closed).toBe(true);
  });
  it("terminates and reaps its child on test cancellation", async ({ signal }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      const result = await nativeProbe("setInterval(()=>{},1000);", AbortSignal.any([signal, controller.signal]));
      expect(result.failure).toBe("cancelled"); expect(result.closed).toBe(true);
    } finally { clearTimeout(timer); }
  });
});

describe("disjoint targets before connection, write, or cleanup", () => {
  it("each validator refuses the other namespace, even for the same owner and checkout", () => {
    const legacy = fixture(false), qa = fixture(true);
    expect(validateManifest(legacy)).toEqual(legacy); expect(validateManual(qa)).toEqual(qa);
    expect(() => validateManifest(qa)).toThrow(); expect(() => validateManual(legacy)).toThrow();
    expect(() => validateTarget(databaseUrl(qa, qa.databases[0].name, "migration"), legacy, "migration")).toThrow();
    expect(() => validateManualTarget(databaseUrl(legacy, legacy.databases[0].name, "migration"), qa, "migration")).toThrow();
    expect(qa.project).not.toBe(legacy.project); expect(qa.container).not.toBe(legacy.container);
    expect(qa.volume).not.toBe(legacy.volume); expect(qa.migrationRole).not.toBe(legacy.migrationRole);
    expect(qa.databases[0].name).not.toBe(legacy.databases[0].name);
    expect(() => validateManual({ ...qa, port: 55432 })).toThrow();
  });
  it("uses separate control, lease, PostgreSQL, HTTP and build namespaces", () => {
    expect(manualPaths.manifestPath).not.toBe(resolve(".cache/m1b/manifest.json"));
    expect(manualPaths.manualControlPath).not.toBe(resolve(".cache/m2-browser.json"));
    expect(manualPaths.lifecycleLockPath).not.toBe(resolve(".cache/local-db-operation.lock"));
    expect(manualPostgresPort).not.toBe(55432); expect(manualHttpPort).not.toBe(3100);
    const server = readFileSync("tools/database/manual.mts", "utf8");
    expect(server).toContain(".next-manual/BUILD_ID");
    expect(server).toContain('"prisma.manual.config.ts"');
    expect(readFileSync("compose.manual.yaml", "utf8")).toContain("edu.usp.qa.owner");
    expect(readFileSync("compose.m1b.yaml", "utf8")).toContain("edu.usp.m1b.owner");
  });
});

// Pure QA fixtures never depend on the developer's Windows environment.
beforeEach(() => { vi.stubEnv("LOCALAPPDATA", resolve("synthetic-local-appdata")); });
afterEach(() => { vi.unstubAllEnvs(); });
