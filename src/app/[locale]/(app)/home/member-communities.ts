import type { Locale } from "@/i18n/locales";
import { communityId, membershipLimit } from "@/server/communities/policy";
import { normalizeArchiveText } from "@/server/archive/normalize";
import type { listMemberCommunities } from "@/server/communities/service";

export type MemberCommunity = Awaited<ReturnType<typeof listMemberCommunities>>["items"][number];

/** Above this many communities the composer's picker gets a search field. */
export const pickerSearchThreshold = 8;

/** Validates GET /api/communities/mine. */
export function memberCommunitiesResponse(value: unknown): MemberCommunity[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid communities");
  const page = value as Record<string, unknown>;
  if (page.ok !== true || !Array.isArray(page.items) || page.items.length > membershipLimit) throw new Error("Invalid communities");
  const items = page.items.map((value: unknown): MemberCommunity => {
    if (!value || typeof value !== "object") throw new Error("Invalid community");
    const row = value as Record<string, unknown>;
    if (typeof row.name !== "string" || !row.name || Array.from(row.name).length > 80 ||
      (row.visibility !== "PUBLIC" && row.visibility !== "PRIVATE") || typeof row.isOwner !== "boolean") throw new Error("Invalid community");
    return { id: communityId(row.id), name: row.name, visibility: row.visibility, isOwner: row.isOwner };
  });
  if (new Set(items.map(row => row.id)).size !== items.length) throw new Error("Duplicate community");
  return items;
}

/** Alphabetical for the reader's language. */
export function sortCommunities(items: readonly MemberCommunity[], locale: Locale) {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...items].sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));
}

/** Communities whose name contains every typed word (Arabic and Latin folded as in search). */
export function filterCommunities(items: readonly MemberCommunity[], query: string) {
  const words = normalizeArchiveText(query).split(/\s+/u).filter(Boolean);
  if (!words.length) return [...items];
  return items.filter(item => {
    const name = normalizeArchiveText(item.name);
    return words.every(word => name.includes(word));
  });
}
