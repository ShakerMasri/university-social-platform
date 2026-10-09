import { expect, it } from "vitest";
import { lowercaseEmail } from "./email-case";
import { changedCasePairs, contextualCaseSamples } from "../../../tests/email-case-fixtures";

it("matches the pinned Unicode 17 runtime for every Unicode scalar value", () => {
  expect(process.versions.unicode).toBe("17.0");
  for (let code = 1; code <= 0x10ffff; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    const input = String.fromCodePoint(code);
    // One assertion after the sweep avoids per-scalar test overhead and noisy data.
    if (lowercaseEmail(input) !== input.toLowerCase()) throw new Error(`Case mapping differs at U+${code.toString(16)}`);
  }
});

it("preserves all 28 new case pairs and contextual sigma across new Unicode properties", () => {
  expect(changedCasePairs).toHaveLength(28);
  for (const [upper, lower] of changedCasePairs) expect(lowercaseEmail(upper)).toBe(lower);
  for (const input of contextualCaseSamples) expect(lowercaseEmail(input)).toBe(input.toLowerCase());
});
