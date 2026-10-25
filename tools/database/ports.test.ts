import { formatOperationalError } from "./operational-errors";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:net";
import { ensurePortFree, postgresHostPort } from "./ports";

// No socket is opened; the same helper used by setup is exercised with a fake server.
vi.mock("node:net", () => ({ createServer: vi.fn() }));
class SyntheticServer extends EventEmitter {
  listeningCallback?: () => void;
  closeCallback?: (error?: Error) => void;
  listen = vi.fn((_port: number, _host: string, callback: () => void) => {
    this.listeningCallback = callback;
    return this;
  });
  close = vi.fn((callback: (error?: Error) => void) => {
    this.closeCallback = callback;
    return this;
  });
}
beforeEach(() => { vi.resetAllMocks(); });
describe("fail-closed TCP binding preflight", () => {
  it("binds the requested loopback port and waits for confirmed listener closure", async () => {
    const server = new SyntheticServer();
    vi.mocked(createServer).mockReturnValue(server as unknown as Server);
    let complete = false;
    const checked = ensurePortFree(postgresHostPort).then(() => { complete = true; });
    expect(server.listen).toHaveBeenCalledWith(55432, "127.0.0.1", expect.any(Function));
    server.listeningCallback!();
    await Promise.resolve();
    expect(complete).toBe(false);
    server.closeCallback!();
    await checked;
    expect(complete).toBe(true);
    expect(server.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["EADDRINUSE", "already in use (EADDRINUSE)"],
    ["EACCES", "may be excluded or reserved (EACCES)"],
    ["ENOBUFS", "unexpected socket error"],
    [undefined, "unexpected socket error"],
  ])("classifies %s without exposing the original error", async (code, expected) => {
    const server = new SyntheticServer();
    vi.mocked(createServer).mockReturnValue(server as unknown as Server);
    const checked = ensurePortFree(postgresHostPort);
    server.emit("error", Object.assign(new Error("synthetic-private-diagnostic"), { code }));
    await expect(checked).rejects.toThrow(expected);
    await expect(checked).rejects.not.toThrow("synthetic-private-diagnostic");
    const publicError = await checked.catch((error: unknown) => error);
    expect(formatOperationalError(publicError)).toContain(code === "EADDRINUSE" ? "PORT_IN_USE" : code === "EACCES" ? "PORT_DENIED" : "PORT_CHECK");
    expect(formatOperationalError(publicError)).not.toContain("synthetic-private-diagnostic");
    await expect(checked).rejects.toMatchObject({ cause: { message: code === "EADDRINUSE" || code === "EACCES" ? code : "Unexpected TCP preflight failure" } });
  });

  it("rejects an unexpected synchronous listen error safely", async () => {
    const server = new SyntheticServer();
    server.listen.mockImplementation(() => { throw new Error("synthetic-private-diagnostic"); });
    vi.mocked(createServer).mockReturnValue(server as unknown as Server);
    await expect(ensurePortFree(3100)).rejects.toThrow("Local TCP binding check failed for 127.0.0.1:3100; unexpected socket error");
  });

  it("does not report success when listener closure fails", async () => {
    const server = new SyntheticServer();
    vi.mocked(createServer).mockReturnValue(server as unknown as Server);
    const checked = ensurePortFree(postgresHostPort);
    server.listeningCallback!();
    server.closeCallback!(new Error("synthetic-private-diagnostic"));
    await expect(checked).rejects.toThrow("unexpected socket error");
  });
});
