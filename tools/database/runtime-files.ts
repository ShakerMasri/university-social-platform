import { manualPaths } from "./manual-paths.ts";
import { hasPrivatePosixPermissions } from "./legacy-runtime.ts";
import { OperationalError } from "./operational-errors.ts";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

export function powershellPath() {
  if (process.platform !== "win32") throw new Error("Manual QA requires the reviewed Windows local transport");
  return resolve(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
}

export function assertLocalPath(path: string) {
  const target = resolve(path), suffix = relative(manualPaths.runtimeDirectory, target);
  if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error("Local operational path refused");
  let current = target;
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Operational links are not allowed");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export type WindowsAcl = {
  path: string; owner: string; directory: boolean; reparse: boolean; protected: boolean; daclPresent: boolean;
  rules: { sid: string; rights: number; allow: boolean; inherited: boolean; inheritOnly: boolean; inheritance: number }[];
};
const system = "S-1-5-18", administrators = "S-1-5-32-544";
const trustedInstaller = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
const fullControl = 0x1f01ff;
// Existing ancestors may be readable or allow creation of unrelated children.
// Reject replacement/deletion, ACL/owner changes and attribute/reparse changes.
const ancestorMutation = 0x10000000 | 0x40000000 | 0x10000 | 0x40000 | 0x80000 | 0x40 | 0x100 | 0x10;

export function validateWindowsAcl(acl: WindowsAcl, sid: string, privateTarget: boolean) {
  const trusted = [sid, system, administrators];
  if (acl.daclPresent !== true || acl.reparse || !(privateTarget ? [sid] : [...trusted, trustedInstaller]).includes(acl.owner) ||
      (privateTarget && acl.directory && !acl.protected)) throw new Error("Private Windows ACL check failed");
  let ownAccess = false;
  for (const rule of acl.rules) {
    if (privateTarget) {
      if (!rule.allow || !trusted.includes(rule.sid) || (acl.directory && rule.inherited)) throw new Error("Private Windows ACL check failed");
      if (rule.sid === sid && !rule.inheritOnly && (rule.rights & fullControl) === fullControl &&
          (!acl.directory || (rule.inheritance === 3 && !rule.inherited))) ownAccess = true;
    } else if (rule.allow && !rule.inheritOnly && !trusted.includes(rule.sid) &&
        // TrustedInstaller is trusted only for OS ancestors, never runtime data.
        rule.sid !== trustedInstaller && (rule.rights & ancestorMutation) !== 0) {
      throw new Error("Unsafe runtime parent permissions");
    }
  }
  if (privateTarget && !ownAccess) throw new Error("Private Windows ACL check failed");
}

// Windows PowerShell uses .NET Framework's atomic DirectorySecurity overload.
// Only an absent, direct child of a previously validated parent may be created.
// Never Set-Acl on an existing directory (including the repository/ancestors).
const aclScript = `
$ErrorActionPreference = 'Stop'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $base = [Environment]::GetFolderPath('LocalApplicationData')
  if ([IO.Path]::GetDirectoryName([string]$request.root) -ine $base -or [IO.Path]::GetFileName([string]$request.root) -cnotmatch '^usp-runtime-[a-f0-9]{24}$') { throw 'Refused' }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $path = [string]$request.path
  if ($request.create) {
    if ([IO.Directory]::Exists($path) -or [IO.File]::Exists($path) -or -not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($path))) { throw 'Refused' }
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetOwner($sid)
    $security.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $security.AddAccessRule($rule)
    [void][IO.Directory]::CreateDirectory($path, $security)
  }
  $entries = @()
  while ($path) {
    $item = Get-Item -LiteralPath $path -Force
    $acl = Get-Acl -LiteralPath $path
    $raw = New-Object Security.AccessControl.RawSecurityDescriptor($acl.GetSecurityDescriptorBinaryForm(), 0)
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object {
      @{ sid = $_.IdentityReference.Value; rights = [int]$_.FileSystemRights; allow = ($_.AccessControlType -eq 'Allow'); inherited = $_.IsInherited; inheritOnly = (($_.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0); inheritance = [int]$_.InheritanceFlags }
    })
    if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -ne $rules.Count) { throw 'Refused' }
    $entries += @{ path = $path; owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value; directory = $item.PSIsContainer; reparse = (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0); protected = $acl.AreAccessRulesProtected; daclPresent = $true; rules = $rules }
    $path = [IO.Path]::GetDirectoryName($path)
  }
  @{ sid = $sid.Value; entries = $entries } | ConvertTo-Json -Depth 6 -Compress
  exit 0
} catch { exit 1 }
`;

function inspectWindows(path: string, create = false) {
  const result = spawnSync(powershellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", aclScript], {
    input: JSON.stringify({ root: manualPaths.runtimeDirectory, path, create }), encoding: "utf8", windowsHide: true, timeout: 10000,
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) throw new Error("Private Windows ACL check failed; inspect permissions without printing credentials");
  try {
    const report = JSON.parse(result.stdout) as { sid: string; entries: WindowsAcl[] };
    if (!/^S-1-/.test(report.sid) || !Array.isArray(report.entries)) throw new Error("Invalid ACL report");
    let current = path;
    for (const entry of report.entries) {
      if (entry.path !== current) throw new Error("Incomplete ACL chain");
      const suffix = relative(manualPaths.runtimeDirectory, current);
      const privateTarget = !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`);
      validateWindowsAcl(entry, report.sid, privateTarget);
      if (current !== path && !entry.directory) throw new Error("Invalid parent");
      current = dirname(current);
    }
    if (report.entries.at(-1)?.path !== parse(path).root) throw new Error("Incomplete ACL chain");
  } catch { throw new Error("Private Windows ACL or parent protection check failed; no unsafe access allowed"); }
}

export function assertPrivatePath(path: string, createDirectory = false) {
  assertLocalPath(path);
  const target = resolve(path);
  if (createDirectory && !existsSync(target)) {
    const parent = dirname(target);
    if (target !== manualPaths.runtimeDirectory) assertPrivatePath(parent, true);
    if (process.platform === "win32") {
      inspectWindows(parent); // Validate the entire existing chain before creation.
      inspectWindows(target, true); // Atomic DACL, then validate the final result.
      return;
    }
    mkdirSync(target, { mode: 0o700 });
  }
  if (process.platform === "win32") inspectWindows(target);
  else {
    const stat = lstatSync(target);
    // On POSIX the existing .cache container may be listable, but never writable
    // by others; sensitive children retain owner-only modes.
    if (!hasPrivatePosixPermissions(stat, false, process.getuid?.())) throw new OperationalError("RUNTIME_PERMISSIONS");
  }
}

export function writePrivateFile(path: string, contents: string, initial = false, flush = false) {
  assertLocalPath(path);
  assertPrivatePath(dirname(path)); // Must already be securely prepared.
  if (existsSync(path)) assertPrivatePath(path);
  writeFileSync(path, contents, { flag: initial ? "wx" : "w", mode: 0o600, flush });
  assertPrivatePath(path);
}

export function readPrivateFile(path: string) {
  assertPrivatePath(path);
  return readFileSync(path, "utf8");
}

export { runtimeRootFor } from "./manual-paths.ts";
