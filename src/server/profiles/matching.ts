const unicodeWordCharacter = /^[\p{L}\p{N}]$/u;

// Build once per process from the pinned Node Unicode tables. PostgreSQL's
// locale-dependent alnum class does not implement the same Unicode categories.
// Coalesced literal ranges under SQL COLLATE "C" keep this definition identical
// for eligibility, edit characters and word boundaries, including all numbers.
function wordSeparatorPattern() {
  const ranges: string[] = [];
  let start: number | undefined;
  for (let point = 0; point <= 0x110000; point++) {
    const included = point < 0x110000 && unicodeWordCharacter.test(String.fromCodePoint(point));
    if (included && start === undefined) start = point;
    if (!included && start !== undefined) {
      const first = String.fromCodePoint(start), last = String.fromCodePoint(point - 1);
      ranges.push(point - start === 1 ? first : `${first}-${last}`);
      start = undefined;
    }
  }
  return `[^${ranges.join("")}]`;
}
export const peopleWordSeparatorPattern = wordSeparatorPattern();

// Match normalized names AFTER replacing every non-letter/number with a space
// using peopleWordSeparatorPattern. Only letters/numbers enter these finite
// alternatives; user regex syntax is never interpreted. Input is at most 60
// code points and alternatives permit only a single fixed-width edit.
export function peopleTypoPattern(term: string): string | null {
  const letters = Array.from(term);
  if (letters.length < 3 || letters.length > 60 || !letters.every(character => unicodeWordCharacter.test(character))) return null;
  const variants = new Set<string>();
  const character = "[^ ]";
  for (let i = 0; i < letters.length; i++) {
    const before = letters.slice(0, i).join(""), after = letters.slice(i + 1).join("");
    variants.add(before + after); // An extra typed character.
    variants.add(before + character + after); // A substituted character.
    variants.add(before + character + letters.slice(i).join("")); // A missing character.
    if (i + 1 < letters.length) variants.add(before + letters[i + 1] + letters[i] + letters.slice(i + 2).join(""));
  }
  variants.add(term + character);
  // Fuzzy alternatives match whole words; exact partial-name matches remain
  // available separately. Two-character and symbolic terms stay literal.
  return `(^| )(${[...variants].join("|")})($| )`;
}
