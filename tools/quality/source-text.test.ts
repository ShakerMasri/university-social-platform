import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";

// Catches text damaged while files are written (for example an escape such as
// a backslash-u sequence turned into the raw character it names): raw control
// characters, the U+FFFD replacement character, a byte-order mark and
// bidirectional override or isolate controls. Zero-width joiners and Arabic
// marks are legitimate text and are not flagged.
const binary = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".pdf", ".docx", ".zip"]);
// eslint-disable-next-line no-control-regex -- finding raw control characters is the purpose of this check
const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd\ufeff\u202a-\u202e\u2066-\u2069]/gu;

// Generated Unicode data that lists these characters on purpose (the email
// case rules must recognise them). The migration is applied and frozen.
const intentional = new Set([
  "src/server/database/email-case-data.ts",
  "prisma/migrations/20261009010000_m1b_email_case_contract/migration.sql",
]);

function sourceFiles() {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return listed.split("\0").filter((path) => path && !binary.has(extname(path).toLowerCase()));
}

describe("source text", () => {
  it("has no raw control, replacement, byte-order or bidi control characters", () => {
    const findings: string[] = [];
    const files = sourceFiles();
    for (const path of intentional) expect(files, `${path} is exempt but no longer exists; update the list`).toContain(path);
    for (const path of files) {
      if (intentional.has(path)) continue;
      let text: string;
      try { text = readFileSync(path, "utf8"); } catch { continue; } // deleted in the working tree
      text.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(forbidden)) {
          findings.push(`${path}:${index + 1}:${(match.index ?? 0) + 1} U+${match[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
