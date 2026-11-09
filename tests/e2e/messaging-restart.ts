import { expect, type BrowserContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect } from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

// This is the final case of the separately guarded messaging group. It never
// uses the stale interactive registration, retained development data or a PID
// supplied by an old control file. Secret control keys stay in worker memory.
export async function verifyMessagingRestart(contexts: BrowserContext[], conversationId: string) {
  if (process.env.M2_BROWSER_GROUP !== "messaging") throw new Error("Isolated messaging restart group required");
  const path = resolve(".cache/m2-browser.json"), expected = process.env.M2_BROWSER_DATABASE;
  async function stop() {
    const control = JSON.parse(readFileSync(path, "utf8")) as { port: number; key: string; databaseName: string };
    if (control.databaseName !== expected) throw new Error("Messaging restart target mismatch");
    async function command(operation: "status" | "stop") {
      return new Promise<{ databaseName?: unknown; stopped?: unknown }>((accept, reject) => {
        const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, operation }) + "\n"));
        socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Messaging control timeout")); });
        let output = "";
        socket.on("data", chunk => { output += chunk.toString(); if (output.length > 2048) socket.destroy(new Error("Invalid control response")); });
        socket.on("error", () => reject(new Error("Messaging control unavailable")));
        socket.on("end", () => { try { accept(JSON.parse(output)); } catch { reject(new Error("Invalid control response")); } });
      });
    }
    expect((await command("status")).databaseName === expected).toBe(true);
    const reply = await command("stop"); expect(reply.databaseName === expected && reply.stopped === true).toBe(true);
    await expect.poll(() => existsSync(path), { timeout: 15000 }).toBe(false);
  }
  async function snapshots() {
    return Promise.all(contexts.map(async context => {
      const history = await context.request.get(`/api/conversations/${conversationId}/messages`), list = await context.request.get("/api/conversations");
      expect(history.status()).toBe(200); expect(list.status()).toBe(200);
      return JSON.stringify([await history.json(), await list.json()]);
    }));
  }
  const before = await snapshots();
  let replacement: ChildProcess | undefined;
  try {
    for (const context of contexts) for (const page of context.pages()) await page.close();
    await stop();
    const restarted = spawnSync(process.execPath, ["tools/database/local.mts", "messaging-restart-check"], { stdio: "pipe", windowsHide: true, timeout: 45000 });
    expect(restarted.status === 0, "Ownership-checked PostgreSQL restart must succeed without changing retained resources").toBe(true);
    replacement = spawn(process.execPath, ["tools/identity/local-server.mts"], { stdio: "ignore", windowsHide: true });
    replacement.on("error", () => { /* Readiness assertion reports a safe failure. */ });
    await expect.poll(() => existsSync(path), { timeout: 30000 }).toBe(true);
    const after = await snapshots(); expect(JSON.stringify(after) === JSON.stringify(before)).toBe(true);
    for (const context of contexts) {
      const response = await context.request.post(`/api/conversations/${conversationId}/messages`, { headers: { Origin: "http://127.0.0.1:3100" }, data: { body: "Blocked after restart", requestId: crypto.randomUUID() } });
      expect(response.status()).toBe(403);
    }
  } finally {
    try { if (replacement && existsSync(path)) await stop(); }
    finally { if (replacement && replacement.exitCode === null) replacement.kill(); }
  }
}
