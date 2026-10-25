import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { inspectProcesses, type ProcessIdentity } from "./windows-process";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const originalPlatform = process.platform, boot = "638900000000000000";
const processIdentity: ProcessIdentity = { pid: 1234, parentPid: 12, boot, started: "638900000010000000", executable: process.execPath, sid: "S-1-5-21-123" };
const response = (data: unknown) => ({ status: 0, stdout: JSON.stringify(data), stderr: "", pid: 1, signal: null, output: [] });
beforeEach(() => { Object.defineProperty(process, "platform", { value: "win32" }); vi.resetAllMocks(); });
afterEach(() => { Object.defineProperty(process, "platform", { value: originalPlatform }); });

describe("Windows process inspection adapter, mocked OS only", () => {
  it("sends only distinct numeric PIDs and accepts validated OS incarnation evidence", () => {
    vi.mocked(spawnSync).mockReturnValue(response({ boot, processes: [processIdentity] }));
    expect(inspectProcesses([1234, 1234])).toEqual({ boot, processes: [processIdentity] });
    const options = vi.mocked(spawnSync).mock.calls[0][2];
    expect(JSON.parse(String(options?.input))).toEqual({ pids: [1234] });
    expect(options?.timeout).toBe(10000);
  });

  it("distinguishes an authoritative absent PID from failed inspection", () => {
    vi.mocked(spawnSync).mockReturnValue(response({ boot, processes: [] }));
    expect(inspectProcesses([1234]).processes).toEqual([]);
    vi.mocked(spawnSync).mockReturnValue({ ...response({}), status: 1, stderr: "synthetic private failure" });
    expect(() => inspectProcesses([1234])).toThrow("inspection failed");
  });

  it.each([
    { boot: "unknown", processes: [] }, { boot, processes: [processIdentity, processIdentity] },
    { boot, processes: [{ ...processIdentity, pid: 4321 }] }, { boot, processes: [{ ...processIdentity, boot: "638800000000000000" }] },
    { boot, processes: [{ ...processIdentity, started: "unavailable" }] }, { boot, processes: [{ ...processIdentity, sid: null }] },
    { boot, processes: [{ ...processIdentity, executable: "relative.exe" }] }, { boot, processes: null },
  ])("rejects incomplete or inconsistent OS evidence %#", (report) => {
    vi.mocked(spawnSync).mockReturnValue(response(report));
    expect(() => inspectProcesses([1234])).toThrow("evidence invalid");
  });

  it.each([{ pids: [] }, { pids: [0] }, { pids: [-1] }, { pids: [1.5] }])("refuses invalid PID input before launching a helper: $pids", ({ pids }) => {
    expect(() => inspectProcesses(pids)).toThrow("query refused");
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
