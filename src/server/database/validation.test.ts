import { describe, expect, it } from "vitest";
import { normalizeEmail, validateDisplayName } from "./validation";

describe("approved persistence input policies", () => {
  it("preserves trimmed spelling and lowercases the whole matching key", () => {
    expect(normalizeEmail(" \tFirst.Last+Course@EXAMPLE.TEST\n")).toEqual({
      email: "First.Last+Course@EXAMPLE.TEST", emailKey: "first.last+course@example.test",
    });
    expect(normalizeEmail("FIRST.LAST+COURSE@example.test").emailKey)
      .toBe(normalizeEmail("first.last+course@EXAMPLE.TEST").emailKey);
    expect(normalizeEmail("firstlast@example.test").emailKey)
      .not.toBe(normalizeEmail("first.last+course@example.test").emailKey);
  });

  it("enforces the approved 254 code points, including lowercase expansion", () => {
    expect([...normalizeEmail(`${"a".repeat(247)}@x.test`).email].length).toBe(254);
    expect(() => normalizeEmail(`${"a".repeat(248)}@x.test`)).toThrow();
    expect([...normalizeEmail(`${"ع".repeat(247)}@x.test`).email].length).toBe(254);
    expect(() => normalizeEmail(`${"İ".repeat(247)}@x.test`)).toThrow();
  });

  it("normalizes the confirmed Unicode-version mismatch without restricting the address", () => {
    expect(normalizeEmail(" \uA7CE.synthetic+Course@EXAMPLE.TEST ")).toEqual({
      email: "\uA7CE.synthetic+Course@EXAMPLE.TEST", emailKey: "\uA7CF.synthetic+course@example.test",
    });
    expect(normalizeEmail("\uA7CE.synthetic+Course@EXAMPLE.TEST").emailKey)
      .toBe(normalizeEmail("\uA7CF.synthetic+course@example.test").emailKey);
  });

  it.each(["", " ", "x", "@x.test", "x@", "x@@x.test", "x y@x.test", "x\0@x.test", "\ud800@x.test", null])(
    "rejects malformed email input without echoing it (%#)", (value) => {
      expect(() => normalizeEmail(value)).toThrow();
    },
  );

  it("accepts Arabic, English, mixed text and supplementary Unicode names", () => {
    for (const name of ["أحمد", "Alice", "أحمد Ali", "😀".repeat(60)]) {
      expect(validateDisplayName(` ${name} `)).toBe(name);
    }
  });

  it.each(["", " \t\n", "\u00a0\u2003\ufeff", "ع".repeat(61), "😀".repeat(61), "\ud800", "x\0y", undefined])(
    "rejects invalid display names (%#)", (value) => {
      expect(() => validateDisplayName(value)).toThrow();
    },
  );
});
