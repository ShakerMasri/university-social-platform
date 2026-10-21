import { parseOperationalJson } from "../database/operational-errors.ts";
import next from "next";
import { retireChildControl } from "../database/manual-shutdown.ts";
import { createServer as httpServer } from "node:http";
import { createServer as controlServer } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../database/targets.ts";
import { keyedDigest, peerAddress } from "../../src/server/identity/policy.ts";
import { normalizeEmail } from "../../src/server/database/validation.ts";
import type { LocalIdentity } from "../../src/server/identity/local.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import {
  checkManualFiles, manualControlPath, manualDirectory, readManualSession, assertLocalPath, type ManualSession,
} from "../database/manual-session.ts";

import { assertPrivatePath, browserControlPath, runtimeDirectory, readPrivateFile, writePrivateFile } from "../database/runtime-files.ts";
import { inspectProcesses, sameProcess } from "../database/windows-process.ts";
import { lifecycleLockPath, validateLifecycleLock } from "../database/lifecycle-lock.ts";

// Synthetic test harness only; not the selected hosted architecture. The socket
// peer is authoritative here, and client-supplied forwarding headers are stripped.
async function run() {
  const name = process.env.M2_BROWSER_DATABASE;
  const manual = process.env.USP_MANUAL_IDENTITY === "1";
  if (manual) {
    // Parent records the child's actual OS incarnation before permitting startup.
    if (!process.connected) throw new Error("Manual supervisor required");
    await new Promise<void>((accept, reject) => {
      const timer = setTimeout(() => finish(false), 15000);
      const message = (value: unknown) => {
        if (value && typeof value === "object" && "type" in value && value.type === "manual-initialize" &&
            "runId" in value && value.runId === process.env.USP_MANUAL_RUN_ID) finish(true);
      };
      const disconnect = () => finish(false);
      function finish(ok: boolean) {
        clearTimeout(timer); process.off("message", message); process.off("disconnect", disconnect);
        if (ok) accept(); else reject(new Error("Manual initialization not confirmed"));
      }
      process.on("message", message); process.once("disconnect", disconnect);
    });
  }
  if (manual) checkManualFiles();
  const manifest = readManifest();
  if (process.env.M2_IDENTITY_E2E !== "1" || !manifest.databases.some((d) => d.name === name && d.kind === "test" && d.ready)) {
    throw new Error("An explicitly owned disposable identity browser database is required");
  }
  await assertDatabaseIdentity(databaseUrl(manifest, name!, "runtime"), manifest, "runtime");
  let session: ManualSession | undefined;
  if (manual) {
    session = readManualSession(manifest);
    if (!process.send || !process.connected || session.phase !== "starting" || session.pid !== process.pid ||
        session.databaseName !== name || session.sessionId !== process.env.USP_MANUAL_SESSION_ID ||
        session.runId !== process.env.USP_MANUAL_RUN_ID) throw new Error("Manual supervisor identity required");
    if (!session.execution) throw new Error("Manual process incarnation required");
    const observed = inspectProcesses([process.pid, session.execution.supervisor.pid]);
    const self = observed.processes.find((p) => p.pid === process.pid), parent = observed.processes.find((p) => p.pid === session!.execution!.supervisor.pid);
    const lease = validateLifecycleLock(parseOperationalJson(readPrivateFile(lifecycleLockPath), "LEASE_JSON"));
    if (!self || !parent || !sameProcess(self, session.execution.server) || !sameProcess(parent, session.execution.supervisor) ||
        lease.command !== "manual-start" || lease.nonce !== session.execution.leaseNonce || !sameProcess(lease.process, parent) ||
        lease.scope?.sessionId !== session.sessionId || lease.scope?.runId !== session.runId || lease.scope?.databaseName !== name) throw new Error("Manual process ownership refused");
  }
  const controlPath = manual ? manualControlPath : browserControlPath;
  assertPrivatePath(manual ? manualDirectory : runtimeDirectory);
  if (existsSync(controlPath)) throw new Error("Refusing an existing browser-control file");
  const context: LocalIdentity = { origin: "http://127.0.0.1:3100", databaseName: name!,
    peerKey: randomBytes(32).toString("hex"),
    // Stable within this owned DB's credential lifetime: restarts cannot reset IP limits.
    rateKey: keyedDigest(manifest.runtimePassword, "usp-m2-local-rate-limits"), mailbox: new Map(),
    database: new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl(manifest, name!, "runtime"), connectionTimeoutMillis: 5000, max: 4 }), log: [] }) };
  (globalThis as typeof globalThis & { __uspLocalIdentity?: LocalIdentity }).__uspLocalIdentity = context;
  const app = next({ dev: false, hostname: "127.0.0.1", port: 3100 });
  const handle = app.getRequestHandler();
  const server = httpServer({ requestTimeout: 10000, headersTimeout: 10000 }, async (request, response) => {
    try {
      const ip = peerAddress(request.socket.remoteAddress ?? "");
      if (ip !== "127.0.0.1") { response.writeHead(403).end(); return; }
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
    } catch { if (!response.headersSent) response.writeHead(503); response.end(); }
  });

  // Separate authenticated loopback channel for Playwright's Node worker. It is
  // neither an app route nor accessible with browser cookies. Tokens stay in RAM.
  const key = randomBytes(32).toString("hex");
  const controlSockets = new Set<import("node:net").Socket>();
  const control = controlServer((socket) => {
    controlSockets.add(socket);
    socket.once("close", () => controlSockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(3000, () => socket.destroy());
    let buffer = "", answered = false;
    socket.on("data", (chunk) => {
      if (answered) return;
      buffer += chunk.toString();
      if (Buffer.byteLength(buffer) > 2048) { socket.destroy(); return; }
      if (!buffer.includes("\n")) return;
      answered = true;
      try {
        const input: unknown = JSON.parse(buffer.split("\n")[0]);
        if (!input || typeof input !== "object" || !("key" in input) || typeof input.key !== "string" || !/^[0-9a-f]{64}$/.test(input.key) ||
            !timingSafeEqual(Buffer.from(input.key, "hex"), Buffer.from(key, "hex")) || !("email" in input)) throw new Error("Rejected");
        const emailKey = normalizeEmail(input.email).emailKey;
        for (const [email, message] of context.mailbox) if (message.expiresAt.getTime() <= Date.now()) context.mailbox.delete(email);
        const message = context.mailbox.get(emailKey);
        socket.end(JSON.stringify(message ? { token: message.token } : {}) + "\n");
      } catch { socket.end("{}\n"); }
    });
  });
  let ownedControl: string | undefined, shutdown: Promise<void> | undefined;
  let booted = false, stopRequested = false, finishing = false;
  function stop() {
    shutdown ??= (async () => {
      const closeControl = control.listening ? new Promise<void>((accept, reject) => control.close((error) => error ? reject(error) : accept())) : Promise.resolve();
      for (const socket of controlSockets) socket.destroy();
      const closeHTTP = server.listening ? new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept())) : Promise.resolve();
      server.closeAllConnections();
      const closed = await Promise.allSettled([closeControl, closeHTTP]);
      closed.push(...await Promise.allSettled([app.close()]));
      closed.push(...await Promise.allSettled([context.database.$disconnect()]));
      context.mailbox.clear();
      if (closed.some((result) => result.status === "rejected")) throw new Error("Local shutdown not confirmed");
      retireChildControl(manual, ownedControl, {
        read: () => existsSync(controlPath) ? readPrivateFile(controlPath) : null,
        remove: () => { assertLocalPath(controlPath); unlinkSync(controlPath); },
      });
    })();
    return shutdown;
  }
  async function finish() {
    if (finishing) return;
    finishing = true;
    try {
      await stop();
      if (manual && process.connected && process.send) {
        process.send({ type: "manual-stopped", runId: session!.runId }, (error) => process.exit(error ? 1 : 0));
      } else process.exit(0);
    } catch { process.exit(1); }
  }
  const requestStop = () => { stopRequested = true; if (booted) void finish(); };
  process.once("SIGTERM", requestStop);
  process.once("SIGINT", requestStop);
  if (manual) {
    process.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "type" in message && message.type === "manual-stop" &&
          "runId" in message && message.runId === session!.runId) requestStop();
    });
    process.once("disconnect", requestStop);
  }
  try {
    await app.prepare();
    if (stopRequested || (manual && !process.connected)) throw new Error("Startup cancelled");
    await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(3100, "127.0.0.1", accept); });
    if (stopRequested) throw new Error("Startup cancelled");
    await new Promise<void>((accept, reject) => { control.once("error", reject); control.listen(0, "127.0.0.1", accept); });
    if (stopRequested) throw new Error("Startup cancelled");
    const address = control.address();
    if (!address || typeof address === "string") throw new Error("Invalid control listener");
    const contents = JSON.stringify({ port: address.port, key, databaseName: name,
      ...(session ? { sessionId: session.sessionId, runId: session.runId, pid: process.pid } : {}) });
    writePrivateFile(controlPath, contents, true);
    ownedControl = contents;
    booted = true;
    if (manual) process.send!({ type: "manual-ready", runId: session!.runId }, (error) => { if (error) requestStop(); });
    else console.log("Owned synthetic identity browser server ready on loopback");
  } catch {
    await stop();
    throw new Error("Synthetic server startup failed; sensitive diagnostics omitted");
  }
}

void run().catch(() => {
  console.error("Synthetic server unavailable; inspect owned local setup. Sensitive diagnostics omitted");
  process.exit(1);
});
