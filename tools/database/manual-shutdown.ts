import { parseOperationalJson } from "./operational-errors.ts";
import { stoppedSession, validateManualControl, type ManualSession } from "./manual-session.ts";

type ControlFiles = { read: () => string | null; remove: () => void };

// The supervisor (or explicit recovery) owns retirement. A disconnected manual
// child cannot know whether stopping was persisted, so it always retains evidence.
export function retireChildControl(manual: boolean, expected: string | undefined, files: ControlFiles) {
  if (manual || !expected) return;
  const current = files.read();
  if (current === null) return;
  if (current !== expected) throw new Error("Control ownership changed; removal refused");
  files.remove();
}

export function finishManualRun(s: ManualSession, expected: string | null, result: {
  requested: boolean; acknowledged: boolean; failed: boolean; code: number | null;
}, ops: ControlFiles & { assertLease: () => void; readSession: () => ManualSession }): ManualSession {
  if (!result.requested || !result.acknowledged || result.failed || result.code !== 0) return stoppedSession(s, false, result.code);
  ops.assertLease();
  // Durable stopping precedes deletion. A crash after deletion is recoverable
  // from stopping; a crash before it retains the exact control file.
  if (s.phase !== "stopping" || JSON.stringify(ops.readSession()) !== JSON.stringify(s) || !expected || !s.execution) {
    throw new Error("Persisted shutdown evidence unavailable");
  }
  const control = validateManualControl(parseOperationalJson(expected, "CONTROL_JSON"), s);
  if (control.port !== s.execution.controlPort || ops.read() !== expected) throw new Error("Control ownership changed; removal refused");
  ops.assertLease();
  ops.remove();
  return stoppedSession(s, true, result.code);
}
