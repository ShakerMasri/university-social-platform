import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { powershellPath } from "./runtime-files.ts";

export type ProcessIdentity = { pid: number; parentPid: number; boot: string; started: string; executable: string; sid: string };
export type ProcessSnapshot = { boot: string; processes: ProcessIdentity[] };
const ticks = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{15,19}$/.test(value);
export function validateProcessIdentity(value: unknown): ProcessIdentity {
  const p = value as ProcessIdentity;
  if (!p || Object.keys(p).sort().join(",") !== "boot,executable,parentPid,pid,sid,started" ||
      !Number.isSafeInteger(p.pid) || p.pid < 1 || !Number.isSafeInteger(p.parentPid) || p.parentPid < 0 ||
      !ticks(p.boot) || !ticks(p.started) || BigInt(p.started) < BigInt(p.boot) ||
      typeof p.executable !== "string" || !isAbsolute(p.executable) || typeof p.sid !== "string" || !/^S-1-[0-9-]+$/.test(p.sid)) {
    throw new Error("Process identity evidence unavailable");
  }
  return p;
}
export function sameProcess(a: ProcessIdentity, b: ProcessIdentity) {
  return a.pid === b.pid && a.boot === b.boot && a.started === b.started && a.parentPid === b.parentPid &&
    a.executable.toLowerCase() === b.executable.toLowerCase() && a.sid === b.sid;
}

// No command lines, environments or process credentials are requested.
export const processScript = `
$ErrorActionPreference = 'Stop'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $boot = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime.ToUniversalTime().Ticks.ToString()
  $entries = @()
  foreach ($id in $request.pids) {
    if ([string]$id -notmatch '^[1-9][0-9]*$') { throw 'Refused' }
    $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction Stop
    if ($null -ne $p) {
      $owner = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction Stop
      if ($owner.ReturnValue -ne 0 -or -not $p.ExecutablePath -or -not $p.CreationDate) { throw 'Refused' }
      $entries += @{ pid = [int]$p.ProcessId; parentPid = [int]$p.ParentProcessId; boot = $boot; started = $p.CreationDate.ToUniversalTime().Ticks.ToString(); executable = $p.ExecutablePath; sid = $owner.Sid }
    }
  }
  @{ boot = $boot; processes = $entries } | ConvertTo-Json -Depth 4 -Compress
} catch { exit 1 }
`;
export function inspectProcesses(pids: number[]): ProcessSnapshot {
  if (!pids.length || pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1)) throw new Error("Process query refused");
  const unique = [...new Set(pids)];
  const result = spawnSync(powershellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", processScript], {
    input: JSON.stringify({ pids: unique }), encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) throw new Error("Windows process inspection failed; recovery refused");
  try {
    const snapshot = JSON.parse(result.stdout) as ProcessSnapshot;
    if (!ticks(snapshot.boot) || !Array.isArray(snapshot.processes)) throw new Error();
    const seen = new Set<number>();
    for (const item of snapshot.processes) {
      validateProcessIdentity(item);
      if (!unique.includes(item.pid) || seen.has(item.pid) || item.boot !== snapshot.boot) throw new Error();
      seen.add(item.pid);
    }
    return snapshot;
  } catch { throw new Error("Windows process evidence invalid; recovery refused"); }
}
export function assertProvenDead(recorded: ProcessIdentity, snapshot: ProcessSnapshot) {
  validateProcessIdentity(recorded);
  if (!ticks(snapshot.boot) || BigInt(snapshot.boot) < BigInt(recorded.boot) ||
      (snapshot.boot !== recorded.boot && BigInt(snapshot.boot) <= BigInt(recorded.started))) throw new Error("Ambiguous reboot evidence");
  const current = snapshot.processes.find((p) => p.pid === recorded.pid);
  if (!current) return; // Successful authoritative query, not an inspection failure.
  validateProcessIdentity(current);
  if (current.boot !== snapshot.boot || current.started === recorded.started || sameProcess(recorded, current) ||
      BigInt(current.started) <= BigInt(recorded.started)) throw new Error("Recorded process is alive or incarnation is ambiguous");
  // A later creation time (and validated boot identity) proves PID reuse.
}
