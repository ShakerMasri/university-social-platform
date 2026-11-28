import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";

// Catches text damaged while files are written (for example an escape such as
// a backslash-u sequence turned into the raw character it names): raw control
// characters (NUL included), the U+FFFD replacement character, a byte-order
// mark, bidirectional override or isolate controls, and bytes that are not
// valid UTF-8. Zero-width joiners and Arabic marks are legitimate text and are
// not flagged.

// The only files not scanned: fonts and images, listed by extension. Every
// other file must decode as UTF-8 or the check fails, so a new binary type
// has to be added here on purpose.
const binaryExtensions = new Set([".woff", ".woff2", ".ttf", ".otf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico"]);
// eslint-disable-next-line no-control-regex -- finding raw control characters is the purpose of this check
const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd\ufeff\u202a-\u202e\u2066-\u2069]/gu;
// ignoreBOM keeps a leading byte-order mark in the decoded text so it is reported.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Generated Unicode data that lists these characters on purpose (the email
// case rules must recognise them). The migration is applied and frozen.
const intentional = new Set([
  "src/server/database/email-case-data.ts",
  "prisma/migrations/20261009010000_m1b_email_case_contract/migration.sql",
]);

function sourceFiles() {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return listed.split("\0").filter((path) => path && !binaryExtensions.has(extname(path).toLowerCase()));
}

function readBytes(path: string): Uint8Array | undefined {
  try {
    return readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; // deleted in the working tree
    throw error;
  }
}

/** Every problem in one file's bytes, as "path:line:column U+XXXX" or "path: not valid UTF-8". */
function textProblems(path: string, bytes: Uint8Array): string[] {
  let text: string;
  try { text = utf8.decode(bytes); } catch { return [`${path}: not valid UTF-8`]; }
  const findings: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(forbidden)) {
      findings.push(`${path}:${index + 1}:${(match.index ?? 0) + 1} U+${match[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  });
  return findings;
}

describe("source text", () => {
  it("has no raw control, replacement, byte-order or bidi control characters, and no invalid UTF-8", () => {
    const findings: string[] = [];
    const files = sourceFiles();
    for (const path of intentional) expect(files, `${path} is exempt but no longer exists; update the list`).toContain(path);
    for (const path of files) {
      if (intentional.has(path)) continue;
      const bytes = readBytes(path);
      if (bytes !== undefined) findings.push(...textProblems(path, bytes));
    }
    expect(findings).toEqual([]);
  });

  // Synthetic bytes: the damage is built from code points so this file stays clean.
  const encode = (text: string) => new TextEncoder().encode(text);
  it("reports a raw NUL in a text file", () => {
    expect(textProblems("damaged.ts", encode(`const a = "x${String.fromCodePoint(0)}y";\n`))).toEqual(["damaged.ts:1:13 U+0000"]);
  });
  it("reports bytes that are not valid UTF-8", () => {
    expect(textProblems("latin1.ts", Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))).toEqual(["latin1.ts: not valid UTF-8"]);
  });
  it("reports a leading byte-order mark and a replacement character", () => {
    expect(textProblems("marked.ts", encode(`${String.fromCodePoint(0xfeff)}ok\nbad ${String.fromCodePoint(0xfffd)}\n`))).toEqual(["marked.ts:1:1 U+FEFF", "marked.ts:2:5 U+FFFD"]);
  });
  it("accepts Arabic marks, a zero-width joiner, tabs and CRLF line endings", () => {
    const joiner = String.fromCodePoint(0x200d), fatha = String.fromCodePoint(0x064e);
    expect(textProblems("clean.ts", encode(`\tconst a = "ه${fatha}ندسة ${joiner}";\r\n`))).toEqual([]);
  });
});
