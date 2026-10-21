import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import type { ManualSession } from "./manual-session";

type Result = { files: [string, string][]; session: ManualSession; error: string | null; workerPid: number };
function worker(input: { files?: Result["files"]; failPhase?: string }): Result {
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "tools/database/recovery-retry.fixture.mjs"], {
    input: JSON.stringify(input), encoding: "utf8", windowsHide: true, timeout: 15000,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Result;
}
describe("new-process recovery retry with serialized virtual disk (not native filesystem/ACL proof)", () => {
  it("preserves ambiguous first-journal residue across a newly spawned process", () => {
    const first = worker({ failPhase: "recovering" });
    expect(first.error).toBe("SYNTHETIC_RENAME"); expect(first.session.phase).toBe("running");
    const retry = worker({ files: first.files });
    expect(retry.workerPid).not.toBe(first.workerPid);
    expect(retry.error).toBe("Ambiguous session write requires inspection");
    expect(retry.files).toEqual(first.files); expect(retry.session).toEqual(first.session);
  });
  it("completes the exact final temp write from committed evidence in a new process and stays idempotent", () => {
    const first = worker({ failPhase: "recovered" });
    expect(first.error).toBe("SYNTHETIC_RENAME"); expect(first.session.phase).toBe("recovering");
    const retry = worker({ files: first.files });
    expect(retry.workerPid).not.toBe(first.workerPid);
    expect(retry.error).toBeNull(); expect(retry.session.phase).toBe("recovered");
    expect(retry.session.recoveries).toEqual(first.session.recoveries);
    expect(retry.files).toHaveLength(1);
    const again = worker({ files: retry.files });
    expect(again.error).toBeNull(); expect(again.files).toEqual(retry.files);
  });
});
