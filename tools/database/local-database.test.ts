import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { configuredPostgresPort, assertConfiguredManifestPort, readLocalDatabaseConfig, validateLocalDatabaseConfig } from "./local-database";
import { validateIsolationProfile } from "./isolation";

const disk = vi.hoisted(() => ({ exists: false, text: "", link: false, directory: false, code: "" }));
vi.mock("node:fs", async () => ({
  ...await vi.importActual<typeof import("node:fs")>("node:fs"),
  lstatSync: () => {
    if (disk.code || !disk.exists) throw Object.assign(new Error("synthetic-private-error"), { code: disk.code || "ENOENT" });
    return { isSymbolicLink: () => disk.link, isFile: () => !disk.directory };
  },
  readFileSync: () => disk.text,
}));
const checkout = resolve("ordinary-contributor-checkout");
const local = { version: 1 as const, root: checkout, postgresPort: 25432 };
beforeEach(() => { Object.assign(disk, { exists: false, text: "", link: false, directory: false, code: "" }); });
describe("portable optional local PostgreSQL configuration, no resource access", () => {
  it("preserves baseline default for a fresh ordinary checkout without configuration", () => {
    expect(readLocalDatabaseConfig(checkout)).toBeNull();
    expect(configuredPostgresPort(null, null)).toBe(55432);
  });
  it("accepts an explicit contributor port without a sibling QA checkout", () => {
    disk.exists = true; disk.text = JSON.stringify(local);
    expect(readLocalDatabaseConfig(checkout)).toEqual(local);
    expect(configuredPostgresPort(local, null)).toBe(25432);
  });
  it.each([55432, 15432, 15433])("never replaces existing manifest port %s when settings are absent", (port) => {
    expect(() => assertConfiguredManifestPort(port, null, null)).not.toThrow();
    expect(() => assertConfiguredManifestPort(port, { ...local, postgresPort: port }, null)).not.toThrow();
  });
  it("refuses override versus manifest conflict rather than adopting a different database", () => {
    expect(() => assertConfiguredManifestPort(15432, local, null)).toThrow("LOCAL_PORT_CONFLICT");
  });
  it("keeps the existing isolated profile authoritative and requires any general override to agree", () => {
    const source = resolve("source"), root = source + "-qa-isolated";
    const isolated = validateIsolationProfile({ version: 1, root, sourceRoot: source, sourceOwner: "abcdef123456",
      owner: "123456abcdef", sourcePort: 15432, postgresPort: 15433 }, root);
    expect(configuredPostgresPort(null, isolated)).toBe(15433);
    expect(() => assertConfiguredManifestPort(15433, null, isolated)).not.toThrow();
    expect(() => assertConfiguredManifestPort(15432, null, isolated)).toThrow("LOCAL_PORT_CONFLICT");
    expect(() => configuredPostgresPort(local, isolated)).toThrow("LOCAL_PORT_CONFLICT");
    expect(configuredPostgresPort({ ...local, root, postgresPort: 15433 }, isolated)).toBe(15433);
  });
  it.each([0, 1023, 65536, 15432.5, "15432", null])("refuses invalid port %s", (postgresPort) => {
    expect(() => validateLocalDatabaseConfig({ ...local, postgresPort }, checkout)).toThrow("LOCAL_CONFIG");
  });
  it.each([{ root: "relative" }, { root: resolve("other-machine") }, { version: 2 }, { owner: "copied" }])("refuses copied/invalid configuration %#", (change) => {
    expect(() => validateLocalDatabaseConfig({ ...local, ...change }, checkout)).toThrow("LOCAL_CONFIG");
  });
  it.each(["EACCES", "EPERM", "ENOTDIR", "EIO"])("does not treat metadata failure %s as optional absence", (code) => {
    disk.code = code;
    expect(() => readLocalDatabaseConfig(checkout)).toThrow("LOCAL_CONFIG");
  });
  it.each(["malformed", "link", "directory"])("refuses %s without echoing contents", (kind) => {
    disk.exists = true; disk.text = kind === "malformed" ? '{"password":SYNTHETIC_NEVER_ECHO}' : JSON.stringify(local);
    disk.link = kind === "link"; disk.directory = kind === "directory";
    expect(() => readLocalDatabaseConfig(checkout)).toThrow("LOCAL_CONFIG");
    try { readLocalDatabaseConfig(checkout); } catch (error) { expect(String(error)).not.toContain("SYNTHETIC_NEVER_ECHO"); }
  });
});
