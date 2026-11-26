import { describe, expect, it } from "vitest";
import { avatarInitials, avatarTone, avatarToneCount } from "./avatar-initials";
import { classNames } from "./class-names";
import { formatCount } from "./format-count";
import { parseThemePreference, themeCookie, themeCookieMaxAgeSeconds } from "./theme";

describe("theme preference", () => {
  it("accepts only light or dark", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    for (const value of [undefined, null, "", "system", "Dark", "dark ", "light;dark", 1, {}]) {
      expect(parseThemePreference(value)).toBeNull();
    }
  });

  it("serializes a site-wide, long-lived, same-site cookie", () => {
    expect(themeCookie("dark", false)).toBe(`theme=dark; Path=/; Max-Age=${themeCookieMaxAgeSeconds}; SameSite=Lax`);
    expect(themeCookie("light", true)).toMatch(/; Secure$/);
  });
});

describe("avatar initials", () => {
  it("uses the first and last words", () => {
    expect(avatarInitials("maya khalil")).toBe("MK");
    expect(avatarInitials("  Noor   Al   Haddad ")).toBe("NH");
    expect(avatarInitials("Omar")).toBe("O");
  });

  it("keeps Arabic initials as separate letters", () => {
    expect(avatarInitials("ليان سعيد")).toBe("ل‌س");
    expect(avatarInitials("عمر")).toBe("ع");
  });

  it("does not split a grapheme and ignores symbol-only words", () => {
    expect(avatarInitials("Émile Zola")).toBe("ÉZ");
    expect(avatarInitials("Ána - Lopez")).toBe("ÁL");
  });

  it("falls back for empty names", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials(" - ")).toBe("?");
  });

  it("picks a stable tone in range from the user id", () => {
    const ids = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    for (const id of ids) {
      expect(avatarTone(id)).toBe(avatarTone(id));
      expect(avatarTone(id)).toBeGreaterThanOrEqual(1);
      expect(avatarTone(id)).toBeLessThanOrEqual(avatarToneCount);
    }
    expect(new Set(ids.map(avatarTone)).size).toBe(avatarToneCount);
  });
});

describe("badge counts", () => {
  it("hides zero, negative and invalid counts", () => {
    for (const value of [0, -3, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatCount(value, "en")).toBe("");
  });

  it("caps large counts", () => {
    expect(formatCount(7, "en")).toBe("7");
    expect(formatCount(99, "en")).toBe("99");
    expect(formatCount(100, "en")).toBe("99+");
    expect(formatCount(12, "en", 9)).toBe("9+");
  });

  it("formats digits for the locale", () => {
    expect(formatCount(7, "ar")).toBe(new Intl.NumberFormat("ar").format(7));
    expect(formatCount(150, "ar")).toBe(`${new Intl.NumberFormat("ar").format(99)}+`);
  });
});

describe("classNames", () => {
  it("joins truthy names", () => {
    expect(classNames("a", false, undefined, "b", null, "")).toBe("a b");
  });
});
