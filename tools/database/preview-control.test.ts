import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { resolve } from "node:path";
import { recoverStalePreview, stopPreview } from "../identity/preview-control";
import type { DatabaseRecord, LocalManifest } from "./targets";

vi.mock("node:fs", () => ({ readFileSync: vi.fn(), unlinkSync: vi.fn() }));
const record: DatabaseRecord = { name: "usp_m1b_abcdef123456_dev", kind: "development", ready: true };
const manifest = { databases: [record] } as LocalManifest;
const path = resolve(".cache/m2-preview.json");
const control = (port: number) => ({ key: "a".repeat(64), port, pid: 12345, databaseName: record.name });
let servers: Server[] = [];
async function listen(server = createServer(socket => socket.end())) {
  servers.push(server);
  await new Promise<void>(accept => server.listen(0, "127.0.0.1", accept));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test listener unavailable");
  return address.port;
}
async function closedPort() {
  const server = createServer(), port = await listen(server);
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return port;
}
function absent(): never { throw Object.assign(new Error("Process absent"), { code: "ESRCH" }); }
beforeEach(() => { vi.mocked(readFileSync).mockReset(); vi.mocked(unlinkSync).mockReset(); vi.spyOn(process, "kill").mockImplementation(absent); });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers) if (server.listening) await new Promise<void>(accept => server.close(() => accept()));
  servers = [];
});

describe("owned preview control recovery", () => {
  it("removes a stable owned file only when both PID and actual control listener are absent", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(await closedPort())));
    await expect(recoverStalePreview(manifest, record)).resolves.toBe(true);
    expect(unlinkSync).toHaveBeenCalledExactlyOnceWith(path);
  });
  it("preserves the file for a live PID, including a reused PID", async () => {
    vi.mocked(process.kill).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(12345)));
    await expect(recoverStalePreview(manifest, record)).resolves.toBe(false);
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("refuses cleanup when the old control port is now occupied", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(await listen())));
    await expect(recoverStalePreview(manifest, record)).rejects.toThrow("port is occupied");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("does not treat permission errors as a dead process", async () => {
    vi.mocked(process.kill).mockImplementation(() => { throw Object.assign(new Error("Denied"), { code: "EPERM" }); });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(12345)));
    await expect(recoverStalePreview(manifest, record)).rejects.toThrow("state is uncertain");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("preserves a control file replaced while checking the listener", async () => {
    const value = control(await closedPort());
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(value)).mockReturnValue(JSON.stringify({ ...value, key: "b".repeat(64) }));
    await expect(recoverStalePreview(manifest, record)).rejects.toThrow("state changed");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("rejects unowned, malformed and legacy ambiguous control files without deleting them", async () => {
    const value = control(12345);
    for (const candidate of [null, { ...value, databaseName: "other_database" }, { ...value, pid: undefined }, { ...value, pid: 0 }, { ...value, port: 65536 }, { ...value, key: "bad" }]) {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(candidate));
      await expect(recoverStalePreview(manifest, record)).rejects.toThrow("ownership mismatch");
    }
    vi.mocked(readFileSync).mockReturnValue("invalid JSON");
    await expect(recoverStalePreview(manifest, record)).rejects.toThrow("Invalid preview control file");
    await expect(recoverStalePreview(manifest, record, resolve(".cache/m2-browser.json"))).rejects.toThrow("ownership mismatch");
    await expect(recoverStalePreview(manifest, { ...record, ready: false })).rejects.toThrow("Owned development preview required");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("allows preview:stop to clear a confirmed stale file without a control server", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(await closedPort())));
    await expect(stopPreview(manifest, record)).resolves.toBeUndefined();
    expect(unlinkSync).toHaveBeenCalledExactlyOnceWith(path);
  });
  for (const matching of [true, false]) it(matching ? "authenticates status before stopping a live owned preview" : "never sends stop to a mismatched live target", async () => {
    vi.mocked(process.kill).mockReturnValue(true);
    const operations: string[] = [];
    const port = await listen(createServer(socket => {
      let input = "";
      socket.on("data", chunk => {
        input += chunk.toString(); if (!input.includes("\n")) return;
        const request = JSON.parse(input) as { operation: string; key: string };
        operations.push(request.operation);
        socket.end(JSON.stringify({ databaseName: matching ? record.name : "another_database", stopped: request.operation === "stop" }) + "\n");
      });
    }));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(control(port)));
    if (matching) { await stopPreview(manifest, record); expect(operations).toEqual(["status", "stop"]); }
    else { await expect(stopPreview(manifest, record)).rejects.toThrow("different preview target"); expect(operations).toEqual(["status"]); }
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
