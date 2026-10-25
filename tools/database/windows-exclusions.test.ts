import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertWindowsPortNotExcluded, parseExcludedPortRanges } from "./windows-exclusions";
import { ensurePostgresPortAvailable } from "./ports";
import { createServer } from "node:net";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:net", () => ({ createServer: vi.fn() }));
const table = (rows = "") => "Localized table header\n Start End\n---------- ----------\n" + rows + "\n* - Localized footer\n";
const response = (stdout: string) => ({ status: 0, stdout, stderr: "", pid: 0, signal: null, output: [] });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SystemRoot", resolve("synthetic-windows"));
  vi.mocked(spawnSync).mockReturnValue(response(table()));
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("read-only Windows TCP exclusion preflight", () => {
  it("parses localized headers, empty tables and administered exclusions", () => {
    expect(parseExcludedPortRanges(table())).toEqual([]);
    expect(parseExcludedPortRanges(table("  15432 15433 *\n 55342 55441"))).toEqual([[15432, 15433], [55342, 55441]]);
  });
  it("queries both active IPv4 and IPv6 tables with read-only show commands", () => {
    assertWindowsPortNotExcluded(25432, "win32");
    expect(spawnSync).toHaveBeenCalledTimes(2);
    for (const family of ["ipv4", "ipv6"]) expect(spawnSync).toHaveBeenCalledWith(
      resolve(process.env.SystemRoot!, "System32/netsh.exe"),
      ["interface", family, "show", "excludedportrange", "protocol=tcp", "store=active"],
      expect.objectContaining({ windowsHide: true, timeout: 10000 }));
  });
  it.each(["ipv4", "ipv6"])("refuses an excluded port in %s without choosing another", (family) => {
    vi.mocked(spawnSync).mockImplementation((_file, args) => response(table(args?.includes(family) ? "55342 55441" : "")));
    expect(() => assertWindowsPortNotExcluded(55432, "win32")).toThrow("excluded by Windows");
  });
  it("runs no Windows command on POSIX", () => {
    assertWindowsPortNotExcluded(55432, "linux"); expect(spawnSync).not.toHaveBeenCalled();
  });
  it.each(["", "not a table", table("65535 65536"), table("10000 9999"), table("12345 broken"), table("42")])(
    "refuses incomplete or ambiguous output %#", (output) => {
      expect(() => parseExcludedPortRanges(output)).toThrow("unavailable or ambiguous");
    });
  it("refuses query failure and omits raw diagnostics", () => {
    vi.mocked(spawnSync).mockReturnValue({ ...response("SYNTHETIC_NEVER_ECHO"), status: 1 });
    expect(() => assertWindowsPortNotExcluded(55432, "win32")).toThrow("setup refused");
    expect(() => assertWindowsPortNotExcluded(55432, "win32")).not.toThrow("SYNTHETIC_NEVER_ECHO");
  });
  it.each([0, 1023, 65536, 1.5])("refuses invalid setup port %s before subprocess or bind", async (port) => {
    await expect(ensurePostgresPortAvailable(port)).rejects.toThrow("Invalid PostgreSQL host port");
    expect(spawnSync).not.toHaveBeenCalled(); expect(createServer).not.toHaveBeenCalled();
  });
});

it("replaces a synchronous native-query exception with a fixed public refusal", () => {
  vi.mocked(spawnSync).mockImplementation(() => { throw new Error("SYNTHETIC_NEVER_ECHO"); });
  expect(() => assertWindowsPortNotExcluded(55432, "win32")).toThrow("PORT_INSPECTION");
  expect(() => assertWindowsPortNotExcluded(55432, "win32")).not.toThrow("SYNTHETIC_NEVER_ECHO");
});
