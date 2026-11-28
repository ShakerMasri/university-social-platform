import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

describe("post excerpt", () => {
  it("joins lines and spaces into one paragraph and keeps short text whole", () => {
    expect(excerpt("  First line\n\nسطر ثانٍ\t end  ")).toBe("First line سطر ثانٍ end");
  });
  it("cuts long text at a word boundary and marks it", () => {
    expect(excerpt("alpha beta gamma delta", 15)).toBe("alpha beta…");
  });
  it("never splits a character, even without spaces", () => {
    const result = excerpt("😀".repeat(20), 10);
    expect(Array.from(result)).toHaveLength(11);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\uFFFD/u);
  });
  it("keeps an emoji sequence and an Arabic letter with its marks whole", () => {
    const family = "👩‍👩‍👧", marked = "شَدَّة";
    expect(excerpt(family.repeat(5), 3)).toBe(family.repeat(3) + "…");
    expect(excerpt(marked + marked, 5)).toBe(Array.from(new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(marked + marked), part => part.segment).slice(0, 5).join("") + "…");
  });
});
