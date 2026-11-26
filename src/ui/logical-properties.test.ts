import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Plan acceptance criterion 4: new CSS uses logical properties only, so the
// Arabic layout mirrors correctly. Flags physical left/right properties and
// values. The old harness stylesheet is excluded until Stage 1 deletes it.

const legacyExclusions = new Set(["src/app/globals.css"]);
const physical = [
  /(^|[\s;{])(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)\b/,
  /(^|[\s;{])border-(top|bottom)-(left|right)-radius\b/,
  /(^|[\s;{])(left|right)\s*:/,
  /(^|[\s;{])(float|clear|text-align)\s*:\s*(left|right)\b/,
];

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

describe("logical CSS properties", () => {
  const root = process.cwd();
  const files = cssFiles(join(root, "src")).map((file) => relative(root, file).replaceAll("\\", "/")).filter((file) => !legacyExclusions.has(file));

  it("finds the UI stylesheets", () => {
    expect(files).toContain("src/ui/tokens.css");
  });

  it.each(files)("%s has no physical left/right properties", (file) => {
    const css = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const offending = css.split("\n").map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => physical.some((pattern) => pattern.test(line)));
    expect(offending).toEqual([]);
  });
});
