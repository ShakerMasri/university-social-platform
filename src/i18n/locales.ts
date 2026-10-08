export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

// Initial product default; browser language negotiation is intentionally deferred.
export const defaultLocale: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export const localeDirections = {
  en: "ltr",
  ar: "rtl",
} as const satisfies Record<Locale, "ltr" | "rtl">;
