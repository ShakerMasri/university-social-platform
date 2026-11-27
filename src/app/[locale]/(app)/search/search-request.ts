import type { Locale } from "@/i18n/locales";

// Reading /search URLs and building links between its tabs. Pure functions:
// the server validates every value again through the archive and People
// policies before any search runs.

export const searchTabs = ["all", "posts", "people"] as const; // Communities: Stage 2.
export type SearchTab = (typeof searchTabs)[number];
/** Results per kind on the All tab; the full lists are on the kind's own tab. */
export const allTabPreviewSize = 5;

export type SearchRequest = {
  tab: SearchTab;
  query: string;
  community?: string;
  type?: string;
  after?: string;
  /** A parameter appeared more than once: the URL is not one we produce. */
  duplicate: boolean;
};

type RawParams = Record<string, string | string[] | undefined>;

export function readSearchRequest(params: RawParams): SearchRequest {
  let duplicate = false;
  const single = (key: string) => {
    const value = params[key];
    if (Array.isArray(value)) { duplicate = true; return undefined; }
    // Empty optional fields (for example "All communities") mean "not set".
    return value === undefined || value === "" ? undefined : value;
  };
  const tabValue = single("tab");
  const tab = searchTabs.find((candidate) => candidate === tabValue) ?? "all";
  const request: SearchRequest = { tab, query: single("q") ?? "", duplicate: false };
  const community = single("community"), type = single("type"), after = single("after");
  if (community !== undefined) request.community = community;
  if (type !== undefined) request.type = type;
  if (after !== undefined) request.after = after;
  request.duplicate = duplicate;
  return request;
}

/** A /search link. Filters and the cursor belong to the Posts tab only, the cursor to People too. */
export function searchHref(locale: Locale, target: { tab: SearchTab; query?: string; community?: string; type?: string; after?: string }) {
  const params = new URLSearchParams();
  if (target.tab !== "all") params.set("tab", target.tab);
  if (target.query) params.set("q", target.query);
  if (target.tab === "posts") {
    if (target.community) params.set("community", target.community);
    if (target.type) params.set("type", target.type);
  }
  if (target.after && target.tab !== "all") params.set("after", target.after);
  const query = params.toString();
  return `/${locale}/search${query ? `?${query}` : ""}`;
}

/** Changes whenever the visible results would change; drives focus after a search. */
export function searchSignature(request: SearchRequest) {
  return request.query ? JSON.stringify([request.tab, request.query, request.community, request.type, request.after]) : "";
}

/**
 * Where an old /archive or /people URL now lives. Only the parameters that
 * page understood are kept; anything repeated or unknown is dropped.
 */
export function forwardedSearchHref(locale: Locale, tab: "posts" | "people", params: RawParams) {
  const value = (key: string) => {
    const raw = params[key];
    return typeof raw === "string" && raw !== "" ? raw : undefined;
  };
  return tab === "posts"
    ? searchHref(locale, { tab, query: value("q"), community: value("community"), type: value("type") })
    : searchHref(locale, { tab, query: value("q") });
}
