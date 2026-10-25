import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { readManualDatabaseConfig, configuredManualPort, assertManualManifestPort } from "./manual-config";
import { formatOperationalError } from "./operational-errors";

const disk = vi.hoisted(() => ({ code: "ENOENT", link: false, text: "" }));
vi.mock("node:fs", () => ({
  lstatSync: () => {
    if (disk.code) throw Object.assign(new Error("SYNTHETIC_PRIVATE"), { code: disk.code });
    return { isFile: () => true, isSymbolicLink: () => disk.link };
  },
  readFileSync: () => disk.text,
}));
const root = resolve("synthetic-qa-checkout");
const config = { version: 1 as const, root, postgresPort: 25433 };
beforeEach(() => { disk.code = ""; disk.link = false; disk.text = JSON.stringify(config); });

describe("optional independent QA settings, no runtime or credentials", () => {
  it("defaults only when absent and binds an explicit setting to its own checkout", () => {
    disk.code = "ENOENT";
    expect(readManualDatabaseConfig(root)).toBeNull(); expect(configuredManualPort(null)).toBe(55433);
    disk.code = "";
    expect(readManualDatabaseConfig(root)).toEqual(config);
    expect(configuredManualPort(config)).toBe(25433);
    expect(() => readManualDatabaseConfig(resolve("other-checkout"))).toThrow();
    expect(() => assertManualManifestPort(25433, config)).not.toThrow();
    expect(() => assertManualManifestPort(55433, config)).toThrow("LOCAL_PORT_CONFLICT");
  });
  it.each(["EACCES", "ENOTDIR", "EIO"])("does not turn %s into optional absence", (code) => {
    disk.code = code;
    expect(() => readManualDatabaseConfig(root)).toThrow("MANUAL_CONFIG");
  });
  it.each(["malformed", "link", "extra", "bad-port"])("refuses %s with a fixed redacted diagnostic", (kind) => {
    disk.link = kind === "link";
    disk.text = kind === "malformed" ? '{"private":SYNTHETIC_PRIVATE}' : JSON.stringify({ ...config,
      ...kind === "extra" ? { private: "SYNTHETIC_PRIVATE" } : {},
      ...kind === "bad-port" ? { postgresPort: 65536 } : {},
    });
    let error: unknown;
    try { readManualDatabaseConfig(root); } catch (value) { error = value; }
    expect(formatOperationalError(error, true)).toContain("[MANUAL_CONFIG]");
    expect(formatOperationalError(error, true)).not.toContain("SYNTHETIC_PRIVATE");
  });
});
