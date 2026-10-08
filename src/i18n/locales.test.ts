import { describe, expect, it } from "vitest";
import { isLocale } from "./locales";

describe("locale allowlist at the route boundary", () => {
  it.each(["en", "ar"])("accepts supported locale %s", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(["fr", "EN", "AR", "en-US", "ar-SA", " en", "ar ", "", "../en", "en/ar", "%61r"])(
    "rejects unsupported or non-exact locale %j",
    (value) => expect(isLocale(value)).toBe(false),
  );

  it.each([undefined, null, 0, true, ["en"], { locale: "ar" }])(
    "rejects non-string input %j without coercion",
    (value) => expect(isLocale(value)).toBe(false),
  );
});
