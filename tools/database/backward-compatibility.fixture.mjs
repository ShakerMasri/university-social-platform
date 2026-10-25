// Native worker: all operational FS, PostgreSQL and subprocess boundaries mocked.
// Optional source map lets the checkpoint compare the same fixture with actual main.
import * as fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import process from "node:process";
import console from "node:console";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
delete process.env.LOCALAPPDATA;
delete process.env.M1B_MIGRATION_URL;
const events = [], logs = [], errors = [];
const owner = "abcdef123456", prefix = `usp_m1b_${owner}`, project = `usp-m1b-${owner}`;
const manifestPath = resolve(".cache/m1b/manifest.json");
const manifest = {
  version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
  dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
  containerId: "a".repeat(64), volume: `${project}-data`, port: 55432,
  image: "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c",
  migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
  runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
  databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }],
};
if (input.sources) registerHooks({
  load(url, context, next) {
    if (url.startsWith("file:")) {
      const entry = Object.entries(input.sources).find(([path]) => fileURLToPath(url) === resolve(path));
      if (entry) return { source: stripTypeScriptTypes(entry[1], { mode: "strip" }), format: "module", shortCircuit: true };
    }
    return next(url, context);
  },
});
const exports = { ...fs }; delete exports.default;
mock.module("node:fs", { namedExports: {
  ...exports,
  existsSync(path) {
    events.push(["exists", path]);
    return path === resolve("compose.m1b.yaml") || (path === manifestPath && input.command !== "setup") ||
      String(path).includes("local-db-operation.lock"); // Unrelated retained QA lease.
  },
  lstatSync(path) {
    events.push(["stat", path]);
    return { uid: 1000, mode: input.mode ?? 0o755, isDirectory: () => true, isSymbolicLink: () => false, isFile: () => false };
  },
  readFileSync(path) {
    events.push(["read", path]);
    if (path === resolve("package.json")) return '{"name":"university-social-platform"}';
    if (path === manifestPath) return JSON.stringify(manifest);
    throw new Error("QA_CONFIGURATION_OR_FILE_ACCESS_FORBIDDEN");
  },
  mkdirSync() { throw new Error("WRITE_FORBIDDEN"); },
  writeFileSync() { throw new Error("WRITE_FORBIDDEN"); },
  unlinkSync() { throw new Error("WRITE_FORBIDDEN"); },
  rmdirSync() { throw new Error("WRITE_FORBIDDEN"); },
} });
mock.module("node:child_process", { namedExports: {
  spawnSync(command, args) {
    events.push(["process", command, args]);
    if (command !== "docker") throw new Error("QA_NATIVE_PROCESS_FORBIDDEN");
    const result = (value) => ({ status: 0, stdout: value, stderr: "", pid: 0, output: [], signal: null });
    // Stop all mutating workflows at the first read-only Docker boundary.
    if (input.command !== "status") return { ...result(""), status: 1 };
    if (args[0] === "context" && args[1] === "show") return result("desktop-linux");
    if (args[0] === "context") return result(JSON.stringify(manifest.dockerEndpoint));
    if (args[0] === "inspect") return result(JSON.stringify([{
      Id: manifest.containerId, Config: { Image: manifest.image, Labels: {
        "edu.usp.m1b.owner": owner, "com.docker.compose.project": project, "com.docker.compose.service": "postgres",
      } }, Mounts: [{ Type: "volume", Name: manifest.volume, Destination: "/var/lib/postgresql" }],
      HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: String(manifest.port) }] } },
    }]));
    if (args[0] === "volume") return result(JSON.stringify([{ Labels: { "edu.usp.m1b.owner": owner, "com.docker.compose.project": project } }]));
    throw new Error("UNEXPECTED_DOCKER_REQUEST");
  },
} });
mock.module("pg", { namedExports: { Client: class {
  async connect() { events.push(["mock-connect"]); }
  async query() { return { rows: [{ database: manifest.databases[0].name, markedDatabase: manifest.databases[0].name,
    role: manifest.runtimeRole, owner, superuser: false, createDatabase: false, createRole: false }] }; }
  async end() {}
} } });
const log = console.log, error = console.error;
console.log = (value) => logs.push(String(value)); console.error = (value) => errors.push(String(value));
process.argv = [process.execPath, "tools/database/local.mts", input.command];
await import("./local.mts");
const exit = process.exitCode ?? 0; process.exitCode = 0;
console.log = log; console.error = error;
process.stdout.write(JSON.stringify({ exit, events, logs, errors }));
