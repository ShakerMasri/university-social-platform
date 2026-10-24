import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { OperationalError, formatOperationalError, parseOperationalJson } from "./operational-errors";

const sentinel = "SYNTHETIC_PRIVATE_FRAGMENT_43b1";
describe("public operational diagnostics", () => {
  it.each(["MANIFEST_JSON", "SESSION_JSON", "CONTROL_JSON", "LEASE_JSON"] as const)("sanitizes %s parser failures without a cause", (code) => {
    let failure: unknown;
    try { parseOperationalJson('{"private":"' + sentinel + '", "broken":' + sentinel + '}', code); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ code });
    expect(failure).not.toHaveProperty("cause");
    expect(String(failure)).not.toContain(sentinel);
    expect((failure as Error).stack).not.toContain(sentinel);
    expect(JSON.stringify(failure)).not.toContain(sentinel);
    expect(formatOperationalError(failure)).toContain(code);
    expect(formatOperationalError(failure)).not.toContain(sentinel);
  });
  it("never formats raw provider errors or parser messages, even without a password/URL marker", () => {
    for (const value of [new Error(sentinel), new SyntaxError(sentinel), sentinel, { message: sentinel, code: sentinel }, { message: sentinel, code: "MANIFEST_MISSING" }]) {
      expect(formatOperationalError(value)).toContain("[DATABASE]");
      expect(formatOperationalError(value, true)).toContain("[MANUAL]");
      expect(formatOperationalError(value)).not.toContain(sentinel);
    }
  });
  it.each([false, true])("retains safe missing-manifest classification for manual=%s without private paths or contents", (manual) => {
    const error = new OperationalError("MANIFEST_MISSING");
    expect(error).not.toHaveProperty("cause");
    error.message = sentinel; error.cause = new Error(sentinel);
    const diagnostic = formatOperationalError(error, manual);
    expect(diagnostic).toContain("[MANIFEST_MISSING]");
    expect(diagnostic).toContain("Preserve any existing resources");
    expect(diagnostic).not.toContain(sentinel);
  });
  it("keeps both native-process output streams free of protected input", () => {
    // Side-effect-free module only: never invoke the operational CLI or read runtime files.
    const script = `
      import {OperationalError, parseOperationalJson, formatOperationalError} from "./tools/database/operational-errors.ts";
      const secret = process.env.USP_DIAGNOSTIC_SENTINEL;
      for (const code of ["MANIFEST_JSON","SESSION_JSON","CONTROL_JSON","LEASE_JSON"]) {
        try { parseOperationalJson('{"private":' + secret + '}', code); }
        catch (error) { process.stderr.write(formatOperationalError(error) + "\\n"); }
      }
      process.stderr.write(formatOperationalError(new Error(secret)));
      process.stderr.write(formatOperationalError(new OperationalError("MANIFEST_MISSING")));
      process.stdout.write("DIAGNOSTICS_CHECKED");
    `;
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: script, encoding: "utf8", windowsHide: true, timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: "", USP_DIAGNOSTIC_SENTINEL: sentinel },
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
    expect(result.stdout).toBe("DIAGNOSTICS_CHECKED");
    expect(result.stderr).toContain("[MANIFEST_JSON]"); expect(result.stderr).toContain("[DATABASE]");
    expect(result.stderr).toContain("[MANIFEST_MISSING]");
    expect(result.stdout + result.stderr).not.toContain(sentinel);
  });
});

it("does not echo a modified OperationalError message or attached private cause", async () => {
  const { OperationalError } = await import("./operational-errors");
  const error = new OperationalError("MANIFEST_JSON");
  error.message = sentinel;
  error.cause = new Error(sentinel);
  expect(formatOperationalError(error)).toContain("[MANIFEST_JSON]");
  expect(formatOperationalError(error)).not.toContain(sentinel);
});
