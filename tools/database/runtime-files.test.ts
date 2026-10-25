import { manualPaths } from "./manual-paths";
import { readManualDatabaseConfig } from "./manual-config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { image, readManifest, type LocalManifest } from "./manual-targets";
import { manualPostgresPort as postgresHostPort } from "./manual-paths";
import { formatOperationalError } from "./operational-errors";
import { assertPrivatePath, runtimeRootFor, validateWindowsAcl, writePrivateFile, type WindowsAcl } from "./runtime-files";

vi.mock("./manual-config.ts", async () => ({
  ...await vi.importActual<typeof import("./manual-config.ts")>("./manual-config.ts"),
  readManualDatabaseConfig: vi.fn(() => null),
}));

const virtual = vi.hoisted(() => ({
  paths: new Map<string, WindowsAcl>(), files: new Map<string, string>(), events: [] as string[],
  statErrors: new Map<string, string>(),
  modes: new Map<string, number>(), owners: new Map<string, number>(),
  failCreated: false, sid: "S-1-5-21-111-222-333-1001",
}));
function privateAcl(path: string, directory = true): WindowsAcl {
  return { path, owner: virtual.sid, directory, reparse: false, protected: directory, daclPresent: true,
    rules: [{ sid: virtual.sid, rights: 0x1f01ff, allow: true, inherited: !directory, inheritOnly: false, inheritance: directory ? 3 : 0 }] };
}
vi.mock("node:fs", () => ({
  existsSync: (path: string) => virtual.paths.has(path),
  lstatSync: (path: string) => {
    const code = virtual.statErrors.get(path) ?? (virtual.paths.has(path) ? undefined : "ENOENT");
    if (code) throw Object.assign(new Error("Synthetic metadata failure"), { code });
    return { mode: virtual.modes.get(path) ?? 0o700, uid: virtual.owners.get(path) ?? 1000,
      isSymbolicLink: () => virtual.paths.get(path)?.reparse ?? false,
      isDirectory: () => virtual.paths.get(path)?.directory ?? false, isFile: () => !(virtual.paths.get(path)?.directory ?? false) };
  },
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((path: string) => {
    virtual.events.push(`read:${path}`);
    return virtual.files.get(path);
  }),
  writeFileSync: (path: string, contents: string, options: { flag: string }) => {
    if (options.flag === "wx" && virtual.paths.has(path)) throw new Error("Exists");
    virtual.events.push(`write:${path}`);
    virtual.files.set(path, contents); virtual.paths.set(path, privateAcl(path, false));
  },
}));
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const originalPlatform = process.platform;
beforeEach(() => {
  vi.stubEnv("LOCALAPPDATA", resolve("synthetic-local-appdata"));
  vi.mocked(readManualDatabaseConfig).mockReturnValue(null);
  Object.defineProperty(process, "platform", { value: "win32" });
  virtual.paths.clear(); virtual.files.clear(); virtual.statErrors.clear(); virtual.modes.clear(); virtual.owners.clear(); virtual.events.length = 0; virtual.failCreated = false;
  let parent = dirname(manualPaths.runtimeDirectory);
  while (true) {
    virtual.paths.set(parent, privateAcl(parent));
    if (dirname(parent) === parent) break;
    parent = dirname(parent);
  }
  vi.mocked(spawnSync).mockImplementation((_command, _args, options) => {
    const request = JSON.parse(String(options?.input)) as { path: string; create: boolean };
    virtual.events.push(`${request.create ? "create" : "inspect"}:${request.path}`);
    if (request.create) {
      virtual.paths.set(request.path, privateAcl(request.path));
      if (virtual.failCreated) virtual.paths.get(request.path)!.protected = false;
    }
    const entries: WindowsAcl[] = [];
    let current = request.path;
    while (true) {
      const acl = virtual.paths.get(current);
      if (!acl) return { status: 1, stdout: "", stderr: "", pid: 0, signal: null, output: [] };
      entries.push(acl);
      if (dirname(current) === current) break;
      current = dirname(current);
    }
    return { status: 0, stdout: JSON.stringify({ sid: virtual.sid, entries }), stderr: "", pid: 0, signal: null, output: [] };
  });
});

function manifestFixture(): LocalManifest {
  const owner = "abcdef123456", project = `usp-qa-${owner}`, prefix = `usp_qa_${owner}`;
  return { version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
    dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    containerId: null, volume: `${project}-data`, image, port: postgresHostPort,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
    runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }] };
}

describe("manifest existence and ACL diagnostics (no real files or credentials)", () => {
  it.each(["ENOENT", "ENOTDIR"])("reports uninitialized setup for %s before any ACL subprocess or content read", (code) => {
    virtual.statErrors.set(manualPaths.manifestPath, code);
    expect(() => readManifest()).toThrow("Local PostgreSQL setup has not been initialized; manifest is missing");
    let error: unknown;
    try { readManifest(); } catch (value) { error = value; }
    expect(error).toMatchObject({ code: "MANIFEST_MISSING" });
    expect(error).not.toHaveProperty("cause");
    expect(formatOperationalError(error)).toContain("[MANIFEST_MISSING]");
    expect(formatOperationalError(error)).not.toContain(manualPaths.manifestPath);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(virtual.files.size).toBe(0);
  });

  it.each(["EACCES", "EPERM", "EIO"])("rejects metadata error %s without misclassifying it as missing", (code) => {
    virtual.statErrors.set(manualPaths.manifestPath, code);
    expect(() => readManifest()).toThrow("Local PostgreSQL manifest metadata check failed");
    let error: unknown;
    try { readManifest(); } catch (value) { error = value; }
    expect(formatOperationalError(error)).toContain("[DATABASE]");
    expect(formatOperationalError(error)).not.toContain(manualPaths.manifestPath);
    expect(readFileSync).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each(["foreign-grant", "foreign-owner", "unsafe-parent"])("rejects an existing manifest with %s before reading its contents", (reason) => {
    assertPrivatePath(manualPaths.databaseDirectory, true);
    virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false));
    virtual.files.set(manualPaths.manifestPath, JSON.stringify(manifestFixture()));
    if (reason === "foreign-owner") virtual.paths.get(manualPaths.manifestPath)!.owner = "S-1-1-0";
    else {
      const target = reason === "unsafe-parent" ? manualPaths.runtimeDirectory : manualPaths.manifestPath;
      virtual.paths.get(target)!.rules.push({ ...privateAcl(target).rules[0], sid: "S-1-1-0" });
    }
    expect(() => readManifest()).toThrow("Private Windows ACL or parent protection check failed");
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("refuses a traditional manifest rather than adopting its resources", () => {
    assertPrivatePath(manualPaths.databaseDirectory, true);
    const m = manifestFixture();
    virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false));
    virtual.files.set(manualPaths.manifestPath, JSON.stringify(m).replaceAll("usp_qa_", "usp_m1b_").replaceAll("usp-qa-", "usp-m1b-"));
    expect(() => readManifest()).toThrow("Invalid project-local database manifest");
  });

  it("reads and validates a synthetic manifest only after verifying file and parent ACLs", () => {
    assertPrivatePath(manualPaths.databaseDirectory, true);
    const manifest = manifestFixture();
    virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false));
    virtual.files.set(manualPaths.manifestPath, JSON.stringify(manifest));
    virtual.events.length = 0;
    expect(readManifest()).toEqual(manifest);
    expect(virtual.events).toEqual([`inspect:${manualPaths.manifestPath}`, `read:${manualPaths.manifestPath}`]);
  });
});

describe("POSIX permission refusal before sensitive writes (mock filesystem)", () => {
  const getuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "getuid", { configurable: true, value: () => 1000 });
    virtual.paths.set(manualPaths.runtimeDirectory, privateAcl(manualPaths.runtimeDirectory));
    virtual.paths.set(manualPaths.databaseDirectory, privateAcl(manualPaths.databaseDirectory));
    virtual.modes.set(manualPaths.runtimeDirectory, 0o700);
  });
  afterEach(() => {
    if (getuidDescriptor) Object.defineProperty(process, "getuid", getuidDescriptor);
    else Reflect.deleteProperty(process, "getuid");
  });
  it.each(["historical-0755", "group-writable", "foreign-owner"])("refuses %s directory before creating or overwriting a manifest", (reason) => {
    virtual.modes.set(manualPaths.databaseDirectory, reason === "group-writable" ? 0o770 : reason === "historical-0755" ? 0o755 : 0o700);
    if (reason === "foreign-owner") virtual.owners.set(manualPaths.databaseDirectory, 2000);
    const original = "SYNTHETIC_RETAINED_MANIFEST";
    virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false)); virtual.files.set(manualPaths.manifestPath, original);
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).toThrow("[RUNTIME_PERMISSIONS]");
    expect(() => writePrivateFile(manualPaths.manifestPath, "replacement")).toThrow("[RUNTIME_PERMISSIONS]");
    expect(() => writePrivateFile(manualPaths.bootstrapPasswordPath, "new-secret", true)).toThrow("[RUNTIME_PERMISSIONS]");
    expect(virtual.files).toEqual(new Map([[manualPaths.manifestPath, original]]));
    expect(virtual.events).toEqual([]); expect(spawnSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });
  it("allows owner-only 0700 QA directories", () => {
    expect(() => assertPrivatePath(manualPaths.runtimeDirectory)).not.toThrow();
    expect(() => writePrivateFile(manualPaths.manifestPath, "synthetic-manifest", true)).not.toThrow();
    expect(virtual.files.get(manualPaths.manifestPath)).toBe("synthetic-manifest");
  });
  it.each([0o775, 0o777])("still refuses a writable cache container at mode %s", (mode) => {
    virtual.modes.set(manualPaths.runtimeDirectory, mode);
    expect(() => assertPrivatePath(manualPaths.runtimeDirectory, true)).toThrow("[RUNTIME_PERMISSIONS]");
    expect(virtual.events).toEqual([]);
  });
});
afterEach(() => { vi.unstubAllEnvs(); Object.defineProperty(process, "platform", { value: originalPlatform }); vi.clearAllMocks(); });

describe("private Windows runtime setup (mock ACL/process/filesystem)", () => {
  it("uses one checkout-specific external path without accepting missing/relative app-data paths", () => {
    const base = resolve("synthetic-appdata"), checkout = resolve("synthetic-checkout");
    const root = runtimeRootFor("win32", base, checkout);
    expect(dirname(root)).toBe(base);
    expect(runtimeRootFor("win32", base, checkout)).toBe(root);
    expect(runtimeRootFor("win32", base, resolve("other-checkout"))).not.toBe(root);
    expect(() => runtimeRootFor("win32", undefined, checkout)).toThrow();
    expect(() => runtimeRootFor("win32", "relative", checkout)).toThrow();
  });

  it("validates parents, creates atomic private directories, then writes synthetic credentials", () => {
    assertPrivatePath(manualPaths.databaseDirectory, true);
    writePrivateFile(manualPaths.bootstrapPasswordPath, "synthetic-placeholder", true);
    expect(virtual.events.indexOf(`inspect:${dirname(manualPaths.runtimeDirectory)}`)).toBeLessThan(virtual.events.indexOf(`create:${manualPaths.runtimeDirectory}`));
    expect(virtual.events.indexOf(`create:${manualPaths.databaseDirectory}`)).toBeLessThan(virtual.events.indexOf(`write:${manualPaths.bootstrapPasswordPath}`));
    expect(virtual.events.at(-1)).toBe(`inspect:${manualPaths.bootstrapPasswordPath}`);
    expect(virtual.files.get(manualPaths.bootstrapPasswordPath)).toBe("synthetic-placeholder");
    expect(String(vi.mocked(spawnSync).mock.calls[0][1])).toContain("CreateDirectory($path, $security)");
  });

  it.each(["manifest.json", "bootstrap-password", "compose.env", "../m2-browser.json", "../local-db-operation.lock", "../manual-identity/session.json", "../manual-identity/control.json", "../manual-identity/session.next.json"])("refuses first write to %s before parent preparation", (name) => {
    expect(() => writePrivateFile(resolve(manualPaths.databaseDirectory, name), "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it.each(["inherited-foreign", "inherited-owner", "unprotected", "wrong-owner", "inherit-only", "no-child-inheritance", "deny"])("refuses %s on existing runtime directories without re-ACL or writing", (reason) => {
    const acl = privateAcl(manualPaths.runtimeDirectory);
    if (reason === "inherited-foreign") acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", inherited: true });
    if (reason === "inherited-owner") acl.rules[0].inherited = true;
    if (reason === "unprotected") acl.protected = false;
    if (reason === "wrong-owner") acl.owner = "S-1-1-0";
    if (reason === "inherit-only") acl.rules[0].inheritOnly = true;
    if (reason === "no-child-inheritance") acl.rules[0].inheritance = 0;
    if (reason === "deny") acl.rules.push({ ...acl.rules[0], allow: false });
    virtual.paths.set(manualPaths.runtimeDirectory, acl);
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).toThrow();
    expect(() => writePrivateFile(manualPaths.browserControlPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
    expect(virtual.files.size).toBe(0);
  });

  it.each([0x40, 0x10000, 0x40000, 0x80000, 0x100, 0x10, 0x10000000, 0x40000000])("rejects parent attack rights %i before directory creation", (rights) => {
    const acl = virtual.paths.get(dirname(manualPaths.runtimeDirectory))!;
    acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", inherited: true, rights });
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
    expect(virtual.files.size).toBe(0);
  });

  it("permits ancestor read/traverse and unrelated child creation, while rejecting foreign owners and links", () => {
    const acl = virtual.paths.get(dirname(manualPaths.runtimeDirectory))!;
    acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", rights: 0x1200a9 | 4 });
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).not.toThrow();
    acl.owner = "S-1-1-0";
    expect(() => writePrivateFile(manualPaths.bootstrapPasswordPath, "synthetic-placeholder", true)).toThrow();
    acl.owner = virtual.sid; acl.reparse = true;
    expect(() => writePrivateFile(manualPaths.bootstrapPasswordPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it("rejects a failed final DACL, PowerShell failure and incomplete ancestor reports before secret writes", () => {
    virtual.failCreated = true;
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).toThrow();
    expect(virtual.files.size).toBe(0);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "", pid: 0, signal: null, output: [] });
    expect(() => writePrivateFile(manualPaths.browserControlPath, "synthetic-placeholder", true)).toThrow();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify({ sid: virtual.sid, entries: [privateAcl(manualPaths.runtimeDirectory)] }), stderr: "", pid: 0, signal: null, output: [] });
    expect(() => writePrivateFile(manualPaths.browserControlPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it("rechecks existing file ACLs and parents before overwrite", () => {
    assertPrivatePath(manualPaths.databaseDirectory, true);
    writePrivateFile(manualPaths.bootstrapPasswordPath, "synthetic-original", true);
    virtual.paths.get(manualPaths.bootstrapPasswordPath)!.rules.push({ ...privateAcl(manualPaths.bootstrapPasswordPath).rules[0], sid: "S-1-1-0" });
    expect(() => writePrivateFile(manualPaths.bootstrapPasswordPath, "synthetic-replacement")).toThrow();
    expect(virtual.files.get(manualPaths.bootstrapPasswordPath)).toBe("synthetic-original");
  });

  it("does not accept TrustedInstaller or administrator ownership of private data", () => {
    const acl = privateAcl(manualPaths.runtimeDirectory);
    acl.owner = "S-1-5-32-544";
    expect(() => validateWindowsAcl(acl, virtual.sid, true)).toThrow();
    expect(() => validateWindowsAcl(acl, virtual.sid, false)).not.toThrow();
  });

  it("checks higher ancestors before creating any QA directory", () => {
    const ancestor = virtual.paths.get(dirname(dirname(manualPaths.runtimeDirectory)))!;
    ancestor.rules.push({ ...ancestor.rules[0], sid: "S-1-1-0", rights: 0x40 });
    expect(() => assertPrivatePath(manualPaths.databaseDirectory, true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
  });

  it("refuses paths outside the selected runtime root", () => {
    expect(() => writePrivateFile(resolve("package.json"), "synthetic-placeholder", true)).toThrow();
    expect(() => writePrivateFile(resolve(manualPaths.runtimeDirectory, "../outside.json"), "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it.each([true, false])("rejects a null DACL for privateTarget=%s, including ancestors", (privateTarget) => {
    const acl = { ...privateAcl(manualPaths.runtimeDirectory), daclPresent: false, rules: [] };
    expect(() => validateWindowsAcl(acl, virtual.sid, privateTarget)).toThrow();
  });
});

it("rejects malformed protected manifest JSON after ACL checks without exposing fragments", () => {
  assertPrivatePath(manualPaths.databaseDirectory, true);
  virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false));
  const sentinel = "SYNTHETIC_MANIFEST_FRAGMENT_f2b4";
  virtual.files.set(manualPaths.manifestPath, '{"runtimePassword":' + sentinel + '}');
  let error: unknown;
  try { readManifest(); } catch (value) { error = value; }
  expect(error).toMatchObject({ code: "MANIFEST_JSON" });
  expect(String(error)).not.toContain(sentinel);
  expect(error).not.toHaveProperty("cause");
  expect(virtual.events.indexOf("inspect:" + manualPaths.manifestPath)).toBeLessThan(virtual.events.indexOf("read:" + manualPaths.manifestPath));
});

it.each([55433, 15432, 15433])("reads an existing manifest at port %s without replacing its recorded identity", (port) => {
  assertPrivatePath(manualPaths.databaseDirectory, true);
  const m = { ...manifestFixture(), port };
  virtual.paths.set(manualPaths.manifestPath, privateAcl(manualPaths.manifestPath, false)); virtual.files.set(manualPaths.manifestPath, JSON.stringify(m));
  expect(readManifest()).toEqual(m);
  vi.mocked(readManualDatabaseConfig).mockReturnValue({ version: 1, root: m.root, postgresPort: port });
  expect(readManifest()).toEqual(m);
  vi.mocked(readManualDatabaseConfig).mockReturnValue({ version: 1, root: m.root, postgresPort: port + 1 });
  expect(() => readManifest()).toThrow("LOCAL_PORT_CONFLICT");
  expect(virtual.files.get(manualPaths.manifestPath)).toBe(JSON.stringify(m));
});
