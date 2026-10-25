import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const native = (args: string[], input?: string) => spawnSync(process.execPath, args, {
  cwd: resolve("."), input, encoding: "utf8", timeout: 15000, windowsHide: true,
  // A parent preload/transform hook must not turn this into a transpiled test.
  env: { ...process.env, NODE_OPTIONS: "" },
});
describe("Node native strip-only runtime regression (no lifecycle commands)", () => {
  it("parses every tooling entrypoint and its runtime TS import graph without executing them", () => {
    const result = native(["tools/database/check-native-typescript.mjs"]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { mode: string; files: string[] };
    expect(report.mode).toBe("strip");
    expect(report.files).toEqual(expect.arrayContaining([
      "tools/database/local.mts", "tools/database/manual-recovery.ts", "tools/identity/local-server.mts",
      "tools/identity/manual-mailbox.ts", "tools/database/check-target.mts", "tools/database/email-case-generate.mts",
      "src/server/identity/policy.ts", "src/server/database/validation.ts", "src/generated/prisma/client.ts",
    ]));
    // This app service is handled by Next's compiler, not the native tooling graph.
    expect(report.files).not.toContain("src/server/communities/service.ts");
  });
  it("uses a native parser that rejects parameter properties, runtime enums, namespaces and import aliases", () => {
    const result = native(["--input-type=module"], `
      import assert from "node:assert/strict";
      import { stripTypeScriptTypes } from "node:module";
      for (const source of [
        "class Broken { constructor(readonly code: string) {} }",
        "enum Broken { Value }",
        "namespace Broken { export const value = 1 }",
        'import fs = require("node:fs")'
      ]) assert.throws(() => stripTypeScriptTypes(source, {mode:"strip"}), {code:"ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"});
      stripTypeScriptTypes("class Valid { readonly code: string; constructor(code: string) { this.code = code; } }", {mode:"strip"});
      process.stdout.write("STRIP_GUARD_OK");
    `);
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("STRIP_GUARD_OK");
  });
  it("imports RecoveryRefusal with native Node and preserves Error/code/message behavior", () => {
    const result = native(["--input-type=module"], `
      import assert from "node:assert/strict";
      try {
        const {RecoveryRefusal} = await import("./tools/database/manual-recovery.ts");
        for (const code of ["LEGACY_EVIDENCE","STATE","METADATA","PROCESS","PORT","OWNERSHIP","CHANGED","IO"]) {
          const error = new RecoveryRefusal(code);
          assert(error instanceof Error); assert(error instanceof RecoveryRefusal);
          assert.equal(error.code, code);
          assert.equal(error.message, "Manual recovery refused (" + code + "); retained state requires inspection");
          assert.deepEqual(Object.getOwnPropertyDescriptor(error, "code"), {value:code,writable:true,enumerable:true,configurable:true});
        }
        process.stdout.write("NATIVE_ERROR_API_OK");
      } catch { process.stderr.write("Native RecoveryRefusal import or API check failed"); process.exitCode = 1; }
    `);
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("NATIVE_ERROR_API_OK");
  });
});
