import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Automated contrast check for the design tokens (plan acceptance criterion 6).
// Parses src/ui/tokens.css and checks every pair the components actually use,
// in both themes: 4.5:1 for text (WCAG 1.4.3) and 3:1 for icons, input borders
// and focus indicators (WCAG 1.4.11). Add a pair here when a component puts a
// new foreground token on a new background token.

const tokensPath = join(process.cwd(), "src/ui/tokens.css");
const source = readFileSync(tokensPath, "utf8");

function themeBlock(name: string) {
  const match = source.match(new RegExp(`/\\* theme:${name}:start \\*/([\\s\\S]*?)/\\* theme:${name}:end \\*/`));
  if (!match) throw new Error(`Missing theme block ${name} in tokens.css`);
  const values = new Map<string, string>();
  for (const [, token, value] of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) values.set(token, value.trim());
  return values;
}

function luminance(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected #rrggbb, got ${hex}`);
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const textMinimum = 4.5;
const nonTextMinimum = 3;
const pageSurfaces = ["bg", "surface", "surface-muted"];

// [foreground, background, minimum]
const pairs: Array<[string, string, number]> = [
  ...["text", "text-secondary", "text-muted", "text-subtle", "accent-text", "danger-text"]
    .flatMap((text) => pageSurfaces.map((surface): [string, string, number] => [text, surface, textMinimum])),
  ["text-secondary", "border", textMinimum], // vote counts on the hovered vote button
  ["accent-text", "accent-soft", textMinimum], // active navigation, selected chips, accent badge
  ["on-accent", "accent", textMinimum], // primary buttons, count badges
  ["on-accent", "accent-text", textMinimum], // primary button hover
  ...["question", "discussion", "resource", "announcement"].map((type): [string, string, number] => [`${type}-text`, `${type}-bg`, textMinimum]),
  ...[1, 2, 3, 4].map((tone): [string, string, number] => [`avatar-${tone}-text`, `avatar-${tone}-bg`, textMinimum]),
  // Non-text: focus ring, input borders, unread dot, pressed vote arrow.
  ...pageSurfaces.flatMap((surface): Array<[string, string, number]> => [
    ["accent", surface, nonTextMinimum],
    ["control-border", surface, nonTextMinimum],
    ["danger", surface, nonTextMinimum],
  ]),
  ["accent", "accent-soft", nonTextMinimum], // focus ring on a pressed icon button
];

describe.each(["light", "dark"])("%s theme tokens", (theme) => {
  const tokens = themeBlock(theme);
  it.each(pairs.map(([foreground, background, minimum]) => ({ foreground, background, minimum })))(
    "$foreground on $background meets $minimum:1",
    ({ foreground, background, minimum }) => {
      const fg = tokens.get(`color-${foreground}`);
      const bg = tokens.get(`color-${background}`);
      expect(fg, `--color-${foreground}`).toBeDefined();
      expect(bg, `--color-${background}`).toBeDefined();
      expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
    },
  );
});

describe("token definitions", () => {
  it("defines the same tokens in light and dark", () => {
    expect([...themeBlock("dark").keys()].sort()).toEqual([...themeBlock("light").keys()].sort());
  });

  it("keeps the system-dark block identical to the dark block", () => {
    expect(Object.fromEntries(themeBlock("system-dark"))).toEqual(Object.fromEntries(themeBlock("dark")));
  });

  it("defines every color token that UI stylesheets use", () => {
    const defined = new Set(themeBlock("light").keys());
    const used = new Set<string>();
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith(".css") ? [join(directory, entry.name)] : []);
    for (const file of [...walk(join(process.cwd(), "src/ui")), ...walk(join(process.cwd(), "src/app")).filter((file) => file.endsWith(".module.css"))]) {
      for (const [, token] of readFileSync(file, "utf8").matchAll(/var\(--(color-[a-z0-9-]+)/g)) used.add(token);
    }
    expect([...used].filter((token) => !defined.has(token))).toEqual([]);
  });
});
