import { spawnSync } from "node:child_process";
import { OperationalError } from "./operational-errors.ts";
import { isAbsolute, resolve } from "node:path";

const refused = () => new OperationalError("PORT_INSPECTION");
export function parseExcludedPortRanges(output: string): [number, number][] {
  if (output.length > 65536) throw refused();
  const lines = output.split(/\r?\n/);
  const separator = lines.findIndex((line) => /^\s*-{2,}\s+-{2,}\s*$/.test(line));
  if (separator < 0) throw refused();
  const ranges: [number, number][] = [];
  for (const line of lines.slice(separator + 1)) {
    if (!line.trim() || /^\s*\*\s*[-\u2013]/.test(line)) continue;
    const match = /^\s*([0-9]+)\s+([0-9]+)(?:\s+\*)?\s*$/.exec(line);
    if (!match) throw refused();
    const start = Number(match[1]), end = Number(match[2]);
    if (start < 0 || start > end || end > 65535) throw refused();
    ranges.push([start, end]);
  }
  return ranges;
}
// Read-only netsh show commands. Never add/delete exclusions or alter Registry.
export function assertWindowsPortNotExcluded(port: number, platform = process.platform) {
  if (platform !== "win32") return;
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !isAbsolute(systemRoot)) throw refused();
  const executable = resolve(systemRoot, "System32/netsh.exe");
  for (const family of ["ipv4", "ipv6"]) {
    let result;
    try {
      result = spawnSync(executable, ["interface", family, "show", "excludedportrange", "protocol=tcp", "store=active"], {
        encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 65536, stdio: ["ignore", "pipe", "ignore"],
      });
    } catch { throw refused(); }
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") throw refused();
    if (parseExcludedPortRanges(result.stdout).some(([start, end]) => port >= start && port <= end)) {
      throw new OperationalError("PORT_EXCLUDED");
    }
  }
}
