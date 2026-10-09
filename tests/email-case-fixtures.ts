// UnicodeData 16.0.0 -> 17.0.0: three Latin pairs and 25 Beria Erfe pairs.
// Authoritative source URLs/hashes are recorded in the brief's review follow-up.
export const changedCasePairs: [string, string][] = [
  ["\uA7CE", "\uA7CF"], ["\uA7D2", "\uA7D3"], ["\uA7D4", "\uA7D5"],
  ...Array.from({ length: 25 }, (_, index): [string, string] =>
    [String.fromCodePoint(0x16ea0 + index), String.fromCodePoint(0x16ebb + index)]),
];

export const contextualCaseSamples = [
  "İIıi+ع@EXAMPLE.TEST", "ΟΣ@EXAMPLE.TEST", "Ο\u0301Σ@EXAMPLE.TEST", "Σ@EXAMPLE.TEST",
  "AΣA@EXAMPLE.TEST", "AΣ'@EXAMPLE.TEST", "AΣ\u0307B@EXAMPLE.TEST",
  "A\uA7F1Σ@EXAMPLE.TEST", "AΣ\uA7F1B@EXAMPLE.TEST",
  ...changedCasePairs.flatMap(([upper, lower]) => [
    `${upper}Σ.synthetic@EXAMPLE.TEST`, `${lower}Σ.synthetic@EXAMPLE.TEST`, `AΣ${upper}@EXAMPLE.TEST`,
  ]),
];
