import type { Locale } from "@/i18n/locales";

type RawParams = Record<string, string | string[] | undefined>;
export type HomeTab = "communities" | "for-you";

/**
 * Home's feed tab from its URL: no `tab` is "Your communities", `tab=for-you`
 * is "For you". Anything else (another value, or `tab` repeated) is null, and
 * the page redirects to plain Home.
 */
export function readHomeTab(params: RawParams): HomeTab | null {
  const tab = params.tab;
  if (tab === undefined) return "communities";
  return tab === "for-you" ? "for-you" : null;
}

/** Home's URL for a tab. */
export function homeHref(locale: Locale, tab: HomeTab = "communities") {
  return tab === "for-you" ? `/${locale}?tab=for-you` : `/${locale}`;
}

/**
 * Where an old /feed or /feed/for-you link goes: Home, with every query
 * parameter kept (repeated ones too). /feed/for-you always opens For you.
 */
export function feedRedirectHref(locale: Locale, params: RawParams, forYou: boolean) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (forYou && key === "tab") continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  if (forYou) query.set("tab", "for-you");
  const search = query.toString();
  return search ? `/${locale}?${search}` : `/${locale}`;
}
