import { expect, it } from "vitest";
import { peopleTypoPattern, peopleWordSeparatorPattern } from "./matching";

it("preserves Unicode letters and all number categories while separating symbols", () => {
  const separators = new RegExp(peopleWordSeparatorPattern, "gu");
  expect("a²Ⅷ½١𐐨😀_+.*".replace(separators, " ")).toBe("a²Ⅷ½١𐐨     ");
  for (const word of ["a²a", "aⅧa", "a½a", "١٢٣", "𐐨𐐩𐐪"]) expect(peopleTypoPattern(word)).not.toBeNull();
});

it("bounds maximum Unicode input and does not admit user regex syntax or short/symbolic terms", () => {
  for (const term of [".*", "a+b", "a[b", "a|b", "a(b", "a\\b", "😀😀😀", "ab", "²a", "a".repeat(61)]) expect(peopleTypoPattern(term)).toBeNull();
  expect(Buffer.byteLength(peopleWordSeparatorPattern)).toBeLessThan(20000);
  for (const character of ["a", "²", "𐐨"]) {
    const term = character.repeat(60), pattern = peopleTypoPattern(term)!;
    expect(pattern.length).toBeLessThan(20000);
    expect(new RegExp(pattern, "u").test(term)).toBe(true);
  }
  // Distinct supplementary characters avoid Set deduplication and exercise the
  // largest UTF-16 alternatives at the same 60-code-point input limit.
  const distinct = Array.from({ length: 60 }, (_, i) => String.fromCodePoint(0x10428 + i)).join("");
  const largest = peopleTypoPattern(distinct)!;
  expect(largest.length).toBeLessThan(40000);
  expect(new RegExp(largest, "u").test(distinct)).toBe(true);
});
