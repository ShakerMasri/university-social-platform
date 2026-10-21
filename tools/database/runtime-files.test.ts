import { readLocalDatabaseConfig } from "./local-database";
import { readIsolationProfile } from "./isolation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { image, manifestPath, readManifest, type LocalManifest } from "./targets";
import { postgresHostPort } from "./ports";
import {
  assertPrivatePath, bootstrapPasswordPath, browserControlPath, databaseDirectory, runtimeDirectory,
  runtimeRootFor, validateWindowsAcl, writePrivateFile, type WindowsAcl,
} from "./runtime-files";

vi.mock("./local-database.ts", async () => ({
  ...await vi.importActual<typeof import("./local-database.ts")>("./local-database.ts"),
  readLocalDatabaseConfig: vi.fn(() => null),
}));
vi.mock("./isolation.ts", async () => ({
  ...await vi.importActual<typeof import("./isolation.ts")>("./isolation.ts"),
  readIsolationProfile: vi.fn(() => null),
}));

const virtual = vi.hoisted(() => ({
  paths: new Map<string, WindowsAcl>(), files: new Map<string, string>(), events: [] as string[],
  statErrors: new Map<string, string>(),
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
    return { isSymbolicLink: () => virtual.paths.get(path)?.reparse ?? false,
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
  vi.mocked(readIsolationProfile).mockReturnValue(null);
  vi.mocked(readLocalDatabaseConfig).mockReturnValue(null);
  Object.defineProperty(process, "platform", { value: "win32" });
  virtual.paths.clear(); virtual.files.clear(); virtual.statErrors.clear(); virtual.events.length = 0; virtual.failCreated = false;
  let parent = dirname(runtimeDirectory);
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
  const owner = "abcdef123456", project = `usp-m1b-${owner}`, prefix = `usp_m1b_${owner}`;
  return { version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
    dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    containerId: null, volume: `${project}-data`, image, port: postgresHostPort,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
    runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }] };
}

describe("manifest existence and ACL diagnostics (no real files or credentials)", () => {
  it.each(["ENOENT", "ENOTDIR"])("reports uninitialized setup for %s before any ACL subprocess or content read", (code) => {
    virtual.statErrors.set(manifestPath, code);
    expect(() => readManifest()).toThrow("Local PostgreSQL setup has not been initialized; manifest is missing");
    expect(spawnSync).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(virtual.files.size).toBe(0);
  });

  it.each(["EACCES", "EPERM", "EIO"])("rejects metadata error %s without misclassifying it as missing", (code) => {
    virtual.statErrors.set(manifestPath, code);
    expect(() => readManifest()).toThrow("Local PostgreSQL manifest metadata check failed");
    expect(readFileSync).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each(["foreign-grant", "foreign-owner", "unsafe-parent"])("rejects an existing manifest with %s before reading its contents", (reason) => {
    assertPrivatePath(databaseDirectory, true);
    virtual.paths.set(manifestPath, privateAcl(manifestPath, false));
    virtual.files.set(manifestPath, JSON.stringify(manifestFixture()));
    if (reason === "foreign-owner") virtual.paths.get(manifestPath)!.owner = "S-1-1-0";
    else {
      const target = reason === "unsafe-parent" ? runtimeDirectory : manifestPath;
      virtual.paths.get(target)!.rules.push({ ...privateAcl(target).rules[0], sid: "S-1-1-0" });
    }
    expect(() => readManifest()).toThrow("Private Windows ACL or parent protection check failed");
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("refuses source-owner or source-port manifest adoption after ACL validation", () => {
    assertPrivatePath(databaseDirectory, true);
    const m = manifestFixture();
    virtual.paths.set(manifestPath, privateAcl(manifestPath, false));
    virtual.files.set(manifestPath, JSON.stringify(m));
    const profile = { version: 1 as const, root: m.root, sourceRoot: resolve("source"), sourceOwner: m.owner, sourcePort: m.port, owner: "222222222222", postgresPort: 15433 };
    vi.mocked(readIsolationProfile).mockReturnValue(profile);
    expect(() => readManifest()).toThrow("identity mismatch");
    const isolated = { ...m, owner: profile.owner, project: `usp-m1b-${profile.owner}`, container: `usp-m1b-${profile.owner}-postgres`, volume: `usp-m1b-${profile.owner}-data`, port: profile.postgresPort, migrationRole: `usp_m1b_${profile.owner}_migrate`, runtimeRole: `usp_m1b_${profile.owner}_runtime`, databases: [{ name: `usp_m1b_${profile.owner}_dev`, kind: "development", ready: true }] };
    virtual.files.set(manifestPath, JSON.stringify(isolated));
    expect(readManifest().owner).toBe(profile.owner);
    virtual.files.set(manifestPath, JSON.stringify({ ...isolated, port: profile.sourcePort }));
    expect(() => readManifest()).toThrow("identity mismatch");
  });

  it("reads and validates a synthetic manifest only after verifying file and parent ACLs", () => {
    assertPrivatePath(databaseDirectory, true);
    const manifest = manifestFixture();
    virtual.paths.set(manifestPath, privateAcl(manifestPath, false));
    virtual.files.set(manifestPath, JSON.stringify(manifest));
    virtual.events.length = 0;
    expect(readManifest()).toEqual(manifest);
    expect(virtual.events).toEqual([`inspect:${manifestPath}`, `read:${manifestPath}`]);
  });
});
afterEach(() => { Object.defineProperty(process, "platform", { value: originalPlatform }); vi.clearAllMocks(); });

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
    assertPrivatePath(databaseDirectory, true);
    writePrivateFile(bootstrapPasswordPath, "synthetic-placeholder", true);
    expect(virtual.events.indexOf(`inspect:${dirname(runtimeDirectory)}`)).toBeLessThan(virtual.events.indexOf(`create:${runtimeDirectory}`));
    expect(virtual.events.indexOf(`create:${databaseDirectory}`)).toBeLessThan(virtual.events.indexOf(`write:${bootstrapPasswordPath}`));
    expect(virtual.events.at(-1)).toBe(`inspect:${bootstrapPasswordPath}`);
    expect(virtual.files.get(bootstrapPasswordPath)).toBe("synthetic-placeholder");
    expect(String(vi.mocked(spawnSync).mock.calls[0][1])).toContain("CreateDirectory($path, $security)");
  });

  it.each(["manifest.json", "bootstrap-password", "compose.env", "../m2-browser.json", "../local-db-operation.lock", "../manual-identity/session.json", "../manual-identity/control.json", "../manual-identity/session.next.json"])("refuses first write to %s before parent preparation", (name) => {
    expect(() => writePrivateFile(resolve(databaseDirectory, name), "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it.each(["inherited-foreign", "inherited-owner", "unprotected", "wrong-owner", "inherit-only", "no-child-inheritance", "deny"])("refuses %s on existing runtime directories without re-ACL or writing", (reason) => {
    const acl = privateAcl(runtimeDirectory);
    if (reason === "inherited-foreign") acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", inherited: true });
    if (reason === "inherited-owner") acl.rules[0].inherited = true;
    if (reason === "unprotected") acl.protected = false;
    if (reason === "wrong-owner") acl.owner = "S-1-1-0";
    if (reason === "inherit-only") acl.rules[0].inheritOnly = true;
    if (reason === "no-child-inheritance") acl.rules[0].inheritance = 0;
    if (reason === "deny") acl.rules.push({ ...acl.rules[0], allow: false });
    virtual.paths.set(runtimeDirectory, acl);
    expect(() => assertPrivatePath(databaseDirectory, true)).toThrow();
    expect(() => writePrivateFile(browserControlPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
    expect(virtual.files.size).toBe(0);
  });

  it.each([0x40, 0x10000, 0x40000, 0x80000, 0x100, 0x10, 0x10000000, 0x40000000])("rejects parent attack rights %i before directory creation", (rights) => {
    const acl = virtual.paths.get(dirname(runtimeDirectory))!;
    acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", inherited: true, rights });
    expect(() => assertPrivatePath(databaseDirectory, true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
    expect(virtual.files.size).toBe(0);
  });

  it("permits ancestor read/traverse and unrelated child creation, while rejecting foreign owners and links", () => {
    const acl = virtual.paths.get(dirname(runtimeDirectory))!;
    acl.rules.push({ ...acl.rules[0], sid: "S-1-1-0", rights: 0x1200a9 | 4 });
    expect(() => assertPrivatePath(databaseDirectory, true)).not.toThrow();
    acl.owner = "S-1-1-0";
    expect(() => writePrivateFile(bootstrapPasswordPath, "synthetic-placeholder", true)).toThrow();
    acl.owner = virtual.sid; acl.reparse = true;
    expect(() => writePrivateFile(bootstrapPasswordPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it("rejects a failed final DACL, PowerShell failure and incomplete ancestor reports before secret writes", () => {
    virtual.failCreated = true;
    expect(() => assertPrivatePath(databaseDirectory, true)).toThrow();
    expect(virtual.files.size).toBe(0);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "", pid: 0, signal: null, output: [] });
    expect(() => writePrivateFile(browserControlPath, "synthetic-placeholder", true)).toThrow();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify({ sid: virtual.sid, entries: [privateAcl(runtimeDirectory)] }), stderr: "", pid: 0, signal: null, output: [] });
    expect(() => writePrivateFile(browserControlPath, "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it("rechecks existing file ACLs and parents before overwrite", () => {
    assertPrivatePath(databaseDirectory, true);
    writePrivateFile(bootstrapPasswordPath, "synthetic-original", true);
    virtual.paths.get(bootstrapPasswordPath)!.rules.push({ ...privateAcl(bootstrapPasswordPath).rules[0], sid: "S-1-1-0" });
    expect(() => writePrivateFile(bootstrapPasswordPath, "synthetic-replacement")).toThrow();
    expect(virtual.files.get(bootstrapPasswordPath)).toBe("synthetic-original");
  });

  it("does not accept TrustedInstaller or administrator ownership of private data", () => {
    const acl = privateAcl(runtimeDirectory);
    acl.owner = "S-1-5-32-544";
    expect(() => validateWindowsAcl(acl, virtual.sid, true)).toThrow();
    expect(() => validateWindowsAcl(acl, virtual.sid, false)).not.toThrow();
  });

  it("checks higher ancestors and refuses legacy state without adopting or overwriting it", () => {
    const ancestor = virtual.paths.get(dirname(dirname(runtimeDirectory)))!;
    ancestor.rules.push({ ...ancestor.rules[0], sid: "S-1-1-0", rights: 0x40 });
    expect(() => assertPrivatePath(databaseDirectory, true)).toThrow();
    expect(virtual.events.some((event) => event.startsWith("create:"))).toBe(false);
    ancestor.rules.pop();
    if (runtimeDirectory !== resolve(".cache")) {
      virtual.paths.set(resolve(".cache"), privateAcl(resolve(".cache")));
      virtual.paths.set(resolve(".cache/m1b"), privateAcl(resolve(".cache/m1b")));
      expect(() => assertPrivatePath(databaseDirectory, true)).toThrow("Legacy repository runtime state");
      expect(virtual.files.size).toBe(0);
    }
  });

  it("refuses paths outside the selected runtime root", () => {
    expect(() => writePrivateFile(resolve("package.json"), "synthetic-placeholder", true)).toThrow();
    expect(() => writePrivateFile(resolve(runtimeDirectory, "../outside.json"), "synthetic-placeholder", true)).toThrow();
    expect(virtual.files.size).toBe(0);
  });

  it.each([true, false])("rejects a null DACL for privateTarget=%s, including ancestors", (privateTarget) => {
    const acl = { ...privateAcl(runtimeDirectory), daclPresent: false, rules: [] };
    expect(() => validateWindowsAcl(acl, virtual.sid, privateTarget)).toThrow();
  });
});

it("rejects malformed protected manifest JSON after ACL checks without exposing fragments", () => {
  assertPrivatePath(databaseDirectory, true);
  virtual.paths.set(manifestPath, privateAcl(manifestPath, false));
  const sentinel = "SYNTHETIC_MANIFEST_FRAGMENT_f2b4";
  virtual.files.set(manifestPath, '{"runtimePassword":' + sentinel + '}');
  let error: unknown;
  try { readManifest(); } catch (value) { error = value; }
  expect(error).toMatchObject({ code: "MANIFEST_JSON" });
  expect(String(error)).not.toContain(sentinel);
  expect(error).not.toHaveProperty("cause");
  expect(virtual.events.indexOf("inspect:" + manifestPath)).toBeLessThan(virtual.events.indexOf("read:" + manifestPath));
});

it.each([55432, 15432, 15433])("reads an existing manifest at port %s without replacing its recorded identity", (port) => {
  assertPrivatePath(databaseDirectory, true);
  const m = { ...manifestFixture(), port };
  virtual.paths.set(manifestPath, privateAcl(manifestPath, false)); virtual.files.set(manifestPath, JSON.stringify(m));
  expect(readManifest()).toEqual(m);
  vi.mocked(readLocalDatabaseConfig).mockReturnValue({ version: 1, root: m.root, postgresPort: port });
  expect(readManifest()).toEqual(m);
  vi.mocked(readLocalDatabaseConfig).mockReturnValue({ version: 1, root: m.root, postgresPort: port + 1 });
  expect(() => readManifest()).toThrow("LOCAL_PORT_CONFLICT");
  expect(virtual.files.get(manifestPath)).toBe(JSON.stringify(m));
});
it("rejects disagreement between public port profiles before accessing any protected file", () => {
  const m = manifestFixture();
  vi.mocked(readIsolationProfile).mockReturnValue({ version: 1, root: m.root, sourceRoot: resolve("source"),
    owner: "123456abcdef", sourceOwner: "abcdef123456", sourcePort: 15432, postgresPort: 15433 });
  vi.mocked(readLocalDatabaseConfig).mockReturnValue({ version: 1, root: m.root, postgresPort: 25432 });
  expect(() => readManifest()).toThrow("LOCAL_PORT_CONFLICT");
  expect(readFileSync).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
});
