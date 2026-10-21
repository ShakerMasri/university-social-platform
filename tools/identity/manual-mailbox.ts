import { spawn } from "node:child_process";
import { connect } from "node:net";
import { eligibleEmail, syntheticDomain, tokenValid } from "../../src/server/identity/policy.ts";
import { powershellPath, type ManualControl } from "../database/manual-session.ts";

export function syntheticManualEmail(value: unknown) {
  try { return eligibleEmail(value, [syntheticDomain]).emailKey; }
  catch { throw new Error("Exactly one valid synthetic @university.test email is required"); }
}

export function mailboxTokenResponse(value: string): string {
  try {
    const body: unknown = JSON.parse(value);
    if (!body || typeof body !== "object" || Object.keys(body).join(",") !== "token" || !("token" in body) || !tokenValid(body.token)) throw new Error("Unavailable");
    return body.token;
  } catch { throw new Error("No usable synthetic mailbox response; credentials omitted"); }
}

export async function requestManualToken(control: ManualControl, email: string) {
  const normalized = syntheticManualEmail(email);
  const payload = JSON.stringify({ key: control.key, email: normalized }) + "\n";
  if (Buffer.byteLength(payload) > 2048) throw new Error("Synthetic mailbox request exceeds its control limit");
  return new Promise<string>((accept, reject) => {
    const socket = connect({ host: "127.0.0.1", port: control.port });
    const chunks: Buffer[] = [];
    let size = 0, finished = false;
    const fail = () => {
      if (finished) return;
      finished = true; clearTimeout(deadline); socket.destroy();
      reject(new Error("Private synthetic mailbox unavailable; credentials omitted"));
    };
    const deadline = setTimeout(fail, 3000);
    socket.once("connect", () => { socket.write(payload); });
    socket.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 1024) { fail(); return; }
      chunks.push(chunk);
    });
    socket.once("error", fail);
    socket.once("end", () => {
      if (finished) return;
      try {
        const token = mailboxTokenResponse(Buffer.concat(chunks).toString("utf8"));
        finished = true; clearTimeout(deadline); socket.destroy(); accept(token);
      } catch { fail(); }
    });
    socket.once("close", () => { if (!finished) fail(); });
  });
}

// Fixed script: token enters only on stdin after the Windows preflight. Never
// interpolate it into PowerShell source, arguments, an environment or a file.
// Explicit disabled history/sync settings are required; missing values fail closed.
const clipboardScript = `
$ErrorActionPreference = 'Stop'
$credential = $null
$copied = $false
try {
  $settings = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Clipboard'
  if ($null -eq $settings.EnableClipboardHistory -or $settings.EnableClipboardHistory -ne 0 -or $null -eq $settings.EnableCloudClipboard -or $settings.EnableCloudClipboard -ne 0) { throw 'Refused' }
  Add-Type -AssemblyName System.Windows.Forms
  [Console]::Out.WriteLine('ready')
  [Console]::Out.Flush()
  $credential = [Console]::In.ReadLine()
  if ($null -eq $credential -or $credential -cnotmatch '^[A-Za-z0-9_-]{43}$') { throw 'Refused' }
  [Windows.Forms.Clipboard]::SetText($credential)
  $copied = $true
  [Console]::Out.WriteLine('copied')
  [Console]::Out.Flush()
  Start-Sleep -Seconds 30
} catch { exit 1 }
finally {
  if ($copied) {
    try {
      if ([Windows.Forms.Clipboard]::ContainsText() -and [Windows.Forms.Clipboard]::GetText() -ceq $credential) { [Windows.Forms.Clipboard]::Clear() }
    } catch { exit 1 }
  }
  $credential = $null
}
`;

export async function deliverManualToken(loadToken: () => Promise<string>, onCopied: () => void) {
  const executable = powershellPath();
  await new Promise<void>((accept, reject) => {
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command", clipboardScript], {
      windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
    });
    let ready = false, copied = false, failed = false, pending = "";
    const fail = () => {
      failed = true;
      // Only the helper created by this call, never a PID from a state file.
      child.stdin.destroy();
      child.kill();
    };
    const deadline = setTimeout(fail, 45000);
    child.stdin.on("error", () => { failed = true; });
    child.once("error", () => { failed = true; });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      if (pending.length > 256) { fail(); return; }
      for (;;) {
        const end = pending.indexOf("\n");
        if (end < 0) break;
        const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
        if (line === "ready" && !ready) {
          ready = true;
          void loadToken().then((token) => {
            if (failed || !tokenValid(token)) { fail(); return; }
            child.stdin.end(token + "\n");
          }).catch(fail);
        } else if (line === "copied" && ready && !copied) {
          copied = true; onCopied();
        } else { fail(); return; }
      }
    });
    child.once("close", (code) => {
      clearTimeout(deadline);
      if (failed || code !== 0 || !copied) reject(new Error("Private clipboard delivery failed; verify Windows history/sync are explicitly disabled and inspect clipboard locally"));
      else accept();
    });
  });
}
