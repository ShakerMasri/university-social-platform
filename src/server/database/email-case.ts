import { lowercaseFrom, lowercaseTo, casedPattern, caseIgnorablePattern } from "./email-case-data.ts";

// Fixed Unicode 17 default full lowercasing, shared with the generated SQL
// function. Runtime/OS Unicode upgrades cannot silently change account keys.
const destinations = [...lowercaseTo];
const mappings = new Map([...lowercaseFrom].map((ch, index) => [ch, destinations[index]]));
const cased = new RegExp(casedPattern, "u");
const ignorable = new RegExp(caseIgnorablePattern, "u");

export function lowercaseEmail(value: string): string {
  const characters = [...value];
  const followingCased: boolean[] = [];
  let nextCased = false;
  for (let i = characters.length - 1; i >= 0; i--) {
    const ch = characters[i];
    followingCased[i] = nextCased;
    if (!ignorable.test(ch)) nextCased = cased.test(ch);
  }
  let previousCased = false;
  return characters.map((ch, i) => {
    const result = ch === "Σ" && previousCased && !followingCased[i] ? "ς" :
      ch === "İ" ? "i\u0307" : mappings.get(ch) ?? ch;
    if (!ignorable.test(ch)) previousCased = cased.test(ch);
    return result;
  }).join("");
}
