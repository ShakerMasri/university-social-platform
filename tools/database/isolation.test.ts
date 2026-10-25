import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { readIsolationProfile, validateIsolationProfile, assertIsolatedManifest, assertNoResourceCollisions } from "./isolation";
import { databaseUrl, validateTarget, image, type LocalManifest } from "./targets";
import { runtimeRootFor } from "./runtime-files";

const virtual = vi.hoisted(() => ({ exists: false, contents: "", link: false, regular: true, statError: "" }));
vi.mock("node:fs", async () => ({
  ...await vi.importActual<typeof import("node:fs")>("node:fs"),
  existsSync: () => virtual.exists,
  lstatSync: () => {
    if (virtual.statError || !virtual.exists) throw Object.assign(new Error("Synthetic metadata error"), { code: virtual.statError || "ENOENT" });
    return { isFile: () => virtual.regular, isSymbolicLink: () => virtual.link };
  },
  readFileSync: () => virtual.contents,
}));
const sourceRoot = resolve("fixture-checkout"), root = sourceRoot + "-qa-isolated";
// Deterministic synthetic owners; no developer resource identities.
const profile = { version: 1 as const, root, sourceRoot, sourceOwner: "111111111111", sourcePort: 15432, owner: "222222222222", postgresPort: 15433 };
function manifest(): LocalManifest {
  const owner = profile.owner, prefix = `usp_m1b_${owner}`, project = `usp-m1b-${owner}`;
  return { version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
    containerId: "a".repeat(64), dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    volume: `${project}-data`, port: profile.postgresPort, image,
    migrationRole: `${prefix}_migrate`, runtimeRole: `${prefix}_runtime`, migrationPassword: "b".repeat(64), runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true }, { name: `${prefix}_test_123456abcdef`, kind: "test", ready: true }] };
}
beforeEach(() => { virtual.exists = false; virtual.contents = ""; virtual.link = false; virtual.regular = true; virtual.statError = ""; });

describe("isolated QA identity, no Docker/database/filesystem mutations", () => {
  it("pins a distinct checkout, owner and verified configured port", () => {
    expect(validateIsolationProfile(profile, root)).toEqual(profile);
    const m = manifest(); assertIsolatedManifest(m, { ...profile, root: m.root });
    expect(new URL(databaseUrl(m, m.databases[1].name, "runtime")).port).toBe("15433");
  });
  it.each([
    { owner: profile.sourceOwner }, { postgresPort: 15432 }, { postgresPort: 0 }, { postgresPort: 65536 },
    { postgresPort: "15433" }, { owner: 123456789012 }, { root: sourceRoot }, { sourceRoot: root },
    { root: resolve("other-qa-isolated") }, { version: 2 }, { extra: true },
  ])("rejects invalid or source-sharing configuration %#", (change) => {
    expect(() => validateIsolationProfile({ ...profile, ...change }, root)).toThrow("configuration refused");
  });
  it("refuses a missing isolated profile instead of falling back to port 15432", () => {
    expect(() => readIsolationProfile(root)).toThrow("configuration missing");
    expect(readIsolationProfile(sourceRoot)).toBeNull();
  });
  it("refuses profile links, non-files and malformed JSON", () => {
    virtual.exists = true; virtual.contents = JSON.stringify(profile); virtual.link = true;
    expect(() => readIsolationProfile(root)).toThrow("regular file");
    virtual.link = false; virtual.regular = false;
    expect(() => readIsolationProfile(root)).toThrow("regular file");
    virtual.regular = true; virtual.contents = '{"private":"synthetic-never-echo"';
    expect(() => readIsolationProfile(root)).toThrow("configuration invalid or unreadable");
    try { readIsolationProfile(root); } catch (error) { expect(String(error)).not.toContain("synthetic-never-echo"); }
  });
  it("accepts an exact regular profile and rejects it from another checkout", () => {
    virtual.exists = true; virtual.contents = JSON.stringify(profile);
    expect(readIsolationProfile(root)).toEqual(profile);
    expect(() => readIsolationProfile(sourceRoot)).toThrow();
  });
  it.each(["root", "owner", "port"] as const)("refuses a copied source manifest with changed %s", (field) => {
    const m = manifest(), p = { ...profile, root: m.root };
    const changed = { ...m, [field]: field === "port" ? profile.sourcePort : field === "owner" ? profile.sourceOwner : sourceRoot };
    expect(() => assertIsolatedManifest(changed, p)).toThrow("identity mismatch");
  });
  it("rejects the source test database and source connection even with a valid isolated manifest", () => {
    const m = manifest(), url = databaseUrl(m, m.databases[1].name, "runtime");
    expect(validateTarget(url, m, "runtime")).toBe(m.databases[1].name);
    expect(() => validateTarget(url.replace(m.databases[1].name, `usp_m1b_${profile.sourceOwner}_test_333333333333`), m, "runtime")).toThrow();
    expect(() => validateTarget(url.replace(":15433", ":15432"), m, "runtime")).toThrow();
    expect(() => validateTarget(url.replace(m.owner, profile.sourceOwner), m, "runtime")).toThrow();
  });
  it("derives independent runtime/control/lease namespaces from the checkout path", () => {
    const appData = resolve("fixture-local-app-data");
    expect(runtimeRootFor("win32", appData, sourceRoot)).not.toBe(runtimeRootFor("win32", appData, root));
  });
  it.each(["name", "project", "owner"] as const)("refuses a container or volume collision by %s", (kind) => {
    const m = manifest(), project = kind === "project" ? m.project : "other", owner = kind === "owner" ? m.owner : "other";
    const line = `${kind === "name" ? m.container : "other"}\t${project}\t${owner}\n`;
    expect(() => assertNoResourceCollisions(m, line, "")).toThrow("pre-existing");
    const volume = `${kind === "name" ? m.volume : "other"}\t${project}\t${owner}\n`;
    expect(() => assertNoResourceCollisions(m, "", volume)).toThrow("pre-existing");
  });
  it("accepts unrelated original resources without any mutation or adoption", () => {
    const m = manifest(), old = `usp-m1b-${profile.sourceOwner}`;
    expect(() => assertNoResourceCollisions(m, `${old}-postgres\t${old}\t${profile.sourceOwner}\n`, `${old}-data\t${old}\t${profile.sourceOwner}\n`)).not.toThrow();
    expect(() => assertNoResourceCollisions(m, "unparseable", "")).toThrow("inventory incomplete");
  });
});

it("accepts independently generated contributor paths/owners and refuses unfilled template values", () => {
  const source = resolve("another-contributor/project"), checkout = source + "-qa-isolated";
  const contributor = { ...profile, sourceRoot: source, root: checkout, owner: "123456abcdef", sourceOwner: "abcdef123456",
    sourcePort: 25432, postgresPort: 25433 };
  expect(validateIsolationProfile(contributor, checkout)).toEqual(contributor);
  expect(() => validateIsolationProfile({ ...contributor, root: "relative/project-qa-isolated" }, checkout)).toThrow();
  expect(() => validateIsolationProfile({ ...contributor, owner: "<new independent 12 lowercase hex owner>" }, checkout)).toThrow();
  expect(readIsolationProfile(resolve("fresh-ordinary-checkout"))).toBeNull();
  expect(() => readIsolationProfile(checkout)).toThrow("configuration missing");
});

it.each(["EACCES", "EPERM", "EIO"])("never treats profile inspection failure %s as optional absence", (code) => {
  virtual.statError = code;
  expect(() => readIsolationProfile(sourceRoot)).toThrow("no fallback");
  expect(() => readIsolationProfile(root)).toThrow("no fallback");
});
