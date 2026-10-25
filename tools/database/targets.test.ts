import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { postgresHostPort } from "./ports";
import { assertDistinctTargets, databaseUrl, image, validateManifest, validateTarget, type LocalManifest } from "./targets";

function fixture(): LocalManifest {
  const owner = "abcdef123456";
  const prefix = `usp_m1b_${owner}`;
  return {
    version: 1, root: resolve("."), owner, project: `usp-m1b-${owner}`, container: `usp-m1b-${owner}-postgres`,
    dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    containerId: "a".repeat(64), volume: `usp-m1b-${owner}-data`, image, port: postgresHostPort,
    migrationRole: `${prefix}_migrate`, migrationPassword: "b".repeat(64),
    runtimeRole: `${prefix}_runtime`, runtimePassword: "c".repeat(64),
    databases: [{ name: `${prefix}_dev`, kind: "development", ready: true },
      { name: `${prefix}_test_abcdefabcdef`, kind: "test", ready: true }],
  };
}

describe("local targets rejected before network access", () => {
  it("keeps an existing manifest's registered port authoritative", () => {
    const m = { ...fixture(), port: 25432 };
    const url = databaseUrl(m, m.databases[0].name, "runtime");
    expect(validateTarget(url, m, "runtime")).toBe(m.databases[0].name);
    expect(() => validateTarget(url.replace(":25432", `:${postgresHostPort}`), m, "runtime")).toThrow();
  });

  it("accepts only the exact owned endpoint and selected role", () => {
    const m = fixture();
    const url = databaseUrl(m, m.databases[0].name, "runtime");
    expect(validateTarget(url, m, "runtime")).toBe(m.databases[0].name);
    expect(() => validateTarget(url, m, "migration")).toThrow();
  });

  it("rejects remote/shared/malformed targets, alternate ports and URL options", () => {
    const m = fixture();
    const url = databaseUrl(m, m.databases[0].name, "runtime");
    for (const target of [undefined, "", "not a URL", url.replace("127.0.0.1", "example.test"),
      url.replace("127.0.0.1", "localhost"), url.replace(`:${m.port}`, ":5432"),
      url.replace(m.databases[0].name, "shared"), `${url}?host=example.test`, `${url}#fragment`,
      url.replace("postgresql:", "postgres:"), url.replace(m.runtimePassword, "d".repeat(64))]) {
      expect(() => validateTarget(target, m, "runtime")).toThrow();
    }
  });

  it("rejects missing/malformed manifests and unowned resource records", () => {
    for (const value of [null, {}, { ...fixture(), root: resolve("..") },
      { ...fixture(), dockerEndpoint: "tcp://example.test:2375" },
      { ...fixture(), volume: "other-project-data" }, { ...fixture(), container: "other-service" },
      { ...fixture(), image: "postgres:latest" }, { ...fixture(), databases: [{ name: "existing", kind: "development", ready: true }] }]) {
      expect(() => validateManifest(value)).toThrow();
    }
    const m = fixture();
    m.databases[0].ready = false;
    expect(() => validateTarget(databaseUrl(m, m.databases[0].name, "runtime"), m, "runtime")).toThrow();
  });

  it("rejects identical main/shadow targets and allows two different owned databases", () => {
    const m = fixture();
    const main = databaseUrl(m, m.databases[0].name, "migration");
    expect(() => assertDistinctTargets(main, main, m)).toThrow();
    expect(() => assertDistinctTargets(main, databaseUrl(m, m.databases[1].name, "migration"), m)).not.toThrow();
  });
});
