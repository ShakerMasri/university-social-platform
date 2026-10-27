import { connect } from "node:net";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { LocalManifest, DatabaseRecord } from "../database/targets.ts";

type PreviewControl = { key: string; port: number; databaseName: string; pid: number };

function readControl(manifest: LocalManifest, record: DatabaseRecord, path: string) {
  if (record.kind !== "development" || !record.ready || !manifest.databases.some(entry => entry.name === record.name && entry.kind === "development" && entry.ready)) throw new Error("Owned development preview required");
  if (path !== resolve(".cache/m2-preview.json")) throw new Error("Preview control ownership mismatch");
  const raw = readFileSync(path, "utf8");
  let control: PreviewControl;
  try { control = JSON.parse(raw) as PreviewControl; } catch { throw new Error("Invalid preview control file; inspect before retrying"); }
  if (!control || control.databaseName !== record.name || !Number.isInteger(control.port) || control.port < 1 || control.port > 65535 || typeof control.key !== "string" || !/^[0-9a-f]{64}$/.test(control.key) || !Number.isInteger(control.pid) || control.pid < 1 || control.pid > 2147483647) throw new Error("Preview control ownership mismatch");
  return { raw, control };
}

function processAbsent(pid: number) {
  try { process.kill(pid, 0); return false; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw new Error("Preview process state is uncertain; inspect before retrying", { cause: error });
  }
}

// A crashed process can leave its private control file behind. Clear only this
// development record's file, and only after both PID and listener are absent.
export async function recoverStalePreview(manifest: LocalManifest, record: DatabaseRecord, path = resolve(".cache/m2-preview.json")) {
  const { raw, control } = readControl(manifest, record, path);
  if (!processAbsent(control.pid)) return false;
  await new Promise<void>((accept, reject) => {
    const socket = connect(control.port, "127.0.0.1");
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("Preview control state is uncertain; inspect before retrying")); });
    socket.once("connect", () => { socket.destroy(); reject(new Error("Preview control port is occupied; refusing stale-file cleanup")); });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") accept();
      else reject(new Error("Preview control state is uncertain; inspect before retrying"));
    });
  });
  if (!processAbsent(control.pid) || readFileSync(path, "utf8") !== raw) throw new Error("Preview state changed; refusing stale-file cleanup");
  unlinkSync(path);
  return true;
}

export async function stopPreview(manifest: LocalManifest, record: DatabaseRecord, path = resolve(".cache/m2-preview.json")) {
  if (await recoverStalePreview(manifest, record, path)) return;
  const { control } = readControl(manifest, record, path);
  async function send(operation: "status" | "stop") {
    return new Promise<{ databaseName?: unknown; stopped?: unknown }>((accept, reject) => {
      const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, operation }) + "\n"));
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Preview control unavailable; inspect before retrying")); });
      let output = "";
      socket.on("data", chunk => { output += chunk.toString(); if (output.length > 2048) { socket.destroy(); reject(new Error("Invalid preview control response")); } });
      socket.on("end", () => { try { accept(JSON.parse(output)); } catch { reject(new Error("Invalid preview control response")); } });
      socket.on("error", () => reject(new Error("Preview control unavailable; inspect before retrying")));
    });
  }
  const status = await send("status");
  if (status.databaseName !== record.name) throw new Error("Refusing to stop a different preview target");
  const result = await send("stop");
  if (!result.stopped || result.databaseName !== record.name) throw new Error("Preview shutdown was not confirmed");
}
