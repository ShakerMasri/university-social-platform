import next from "next";
import { createServer as httpServer } from "node:http";
import { createServer as controlServer } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { assertDatabaseIdentity, databaseUrl, type LocalManifest } from "../database/targets.ts";
import { keyedDigest, peerAddress } from "../../src/server/identity/policy.ts";
import { previewConfirmation } from "./preview-confirmation.ts";
import { normalizeEmail } from "../../src/server/database/validation.ts";
import type { LocalIdentity } from "../../src/server/identity/local.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

// Synthetic test harness only; not the selected hosted architecture. The socket
// peer is authoritative here, and client-supplied forwarding headers are stripped.
export async function startLocalIdentityServer(manifest: LocalManifest, name: string, mode: "test" | "preview", port: number, controlPath: string) {
await assertDatabaseIdentity(databaseUrl(manifest, name, "runtime"), manifest, "runtime");
if (existsSync(controlPath)) throw new Error("Existing local server control file requires inspection");
const context: LocalIdentity = { origin: `http://${mode === "preview" ? "localhost" : "127.0.0.1"}:${port}`, mode, databaseName: name,
  peerKey: randomBytes(32).toString("hex"),
  // Stable within this owned DB's credential lifetime: restarts cannot reset IP limits.
  rateKey: keyedDigest(manifest.runtimePassword, "usp-m2-local-rate-limits"), mailbox: new Map(),
  database: new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl(manifest, name!, "runtime"), connectionTimeoutMillis: 5000, max: 4 }), log: [] }) };
(globalThis as typeof globalThis & { __uspLocalIdentity?: LocalIdentity }).__uspLocalIdentity = context;
const app = next({ dev: false, hostname: mode === "preview" ? "localhost" : "127.0.0.1", port });
await app.prepare();
const handle = app.getRequestHandler();
const handler: import("node:http").RequestListener = async (request, response) => {
  try {
    const ip = peerAddress(request.socket.remoteAddress ?? "");
    if ((ip !== "127.0.0.1" && !(mode === "preview" && ip === "::1")) || request.headers.host !== new URL(context.origin).host) { response.writeHead(403).end(); return; }
    if (mode === "preview" && request.url?.startsWith("/__local-preview/confirmation")) { await previewConfirmation(request, response, context); return; }
    for (const header of Object.keys(request.headers)) {
      if (header === "forwarded" || header.startsWith("x-forwarded-") || header === "x-real-ip" || header.startsWith("x-usp-")) delete request.headers[header];
    }
    request.headers["x-usp-peer"] = ip;
    request.headers["x-usp-peer-signature"] = keyedDigest(context.peerKey, ip);
    if (request.url?.includes("/identity/") || request.url?.includes("/communities") || /\/(profile|verify|signin)(?:[?#]|$)/.test(request.url ?? "")) {
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
    }
    await handle(request, response);
  } catch {
    console.error(JSON.stringify({ level: "error", event: "synthetic.http.failed" }));
    if (!response.headersSent) response.writeHead(503);
    response.end();
  }
};
const server = httpServer({ requestTimeout: 10000, headersTimeout: 10000 }, handler);
const ipv6 = mode === "preview" ? httpServer({ requestTimeout: 10000, headersTimeout: 10000 }, handler) : undefined;
try {
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", accept); });
  if (ipv6) await new Promise<void>((accept, reject) => { ipv6.once("error", reject); ipv6.listen({ port, host: "::1", ipv6Only: true }, accept); });
} catch { server.close(); await app.close(); await context.database.$disconnect(); throw new Error("Local identity port is unavailable on loopback"); }

// Separate authenticated loopback channel for Playwright's Node worker. It is
// neither an app route nor accessible with browser cookies. Tokens stay in RAM.
const key = randomBytes(32).toString("hex");
const control = controlServer((socket) => {
  socket.setTimeout(3000, () => socket.destroy());
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    if (Buffer.byteLength(buffer) > 2048) { socket.destroy(); return; }
    if (!buffer.includes("\n")) return;
    try {
      const input: unknown = JSON.parse(buffer.split("\n")[0]);
      if (!input || typeof input !== "object" || !("key" in input) || typeof input.key !== "string" || !/^[0-9a-f]{64}$/.test(input.key) ||
          !timingSafeEqual(Buffer.from(input.key, "hex"), Buffer.from(key, "hex")) || (!("email" in input) && !(mode === "preview" && "operation" in input && ["stop", "status"].includes(String(input.operation))))) throw new Error("Rejected");
      if (mode === "preview" && "operation" in input && input.operation === "status") { socket.end(JSON.stringify({ databaseName: name }) + "\n"); return; }
      if (mode === "preview" && "operation" in input && input.operation === "stop") {
        socket.end(JSON.stringify({ stopped: true, databaseName: name }) + "\n", () => { void stop(); }); return;
      }
      if (!("email" in input)) throw new Error("Rejected");
      const emailKey = normalizeEmail(input.email).emailKey;
      for (const [email, message] of context.mailbox) if (message.expiresAt.getTime() <= Date.now()) context.mailbox.delete(email);
      const message = context.mailbox.get(emailKey);
      socket.end(JSON.stringify(message ? { token: message.token } : {}) + "\n");
    } catch { socket.end("{}\n"); }
  });
});
await new Promise<void>((accept, reject) => { control.once("error", reject); control.listen(0, "127.0.0.1", accept); });
const address = control.address();
if (!address || typeof address === "string") throw new Error("Invalid control listener");
writeFileSync(controlPath, JSON.stringify({ port: address.port, key, databaseName: name, pid: process.pid }), { flag: "wx", mode: 0o600 });
console.log(mode === "preview" ? `Local synthetic preview ready: ${context.origin}/en/signin` : "Owned synthetic identity browser server ready on loopback");
async function stop() {
  control.close(); server.closeAllConnections(); server.close(); ipv6?.closeAllConnections(); ipv6?.close();
  context.mailbox.clear();
  await app.close();
  await context.database.$disconnect();
  if (existsSync(controlPath) && JSON.parse(readFileSync(controlPath, "utf8")).databaseName === name && JSON.parse(readFileSync(controlPath, "utf8")).key === key) unlinkSync(controlPath);
  process.exit(0);
}
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });

}
