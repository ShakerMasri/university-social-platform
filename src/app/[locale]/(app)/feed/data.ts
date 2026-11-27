import { postResponse, type PostItem } from "../communities/content-data";

export type FeedPost = PostItem & { communityName: string; reason?: "joined" | "public" };
export type FeedPage = { items: FeedPost[]; next: string | null; viewer: string; coldStart?: boolean };
export function feedPageResponse(value: unknown): FeedPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid feed response");
  const page = value as Record<string, unknown>;
  if (page.ok !== true || !Array.isArray(page.items) || page.items.length > 20 || typeof page.viewer !== "string" ||
    !/^[0-9a-f]{64}$/.test(page.viewer) || !(page.next === null || typeof page.next === "string" && /^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(page.next))) throw new Error("Invalid feed page");
  const items = page.items.map((value: unknown) => {
    const post = postResponse(value);
    const row = value as Record<string, unknown>;
    if (typeof row.communityName !== "string" || !row.communityName || Array.from(row.communityName).length > 80) throw new Error("Invalid feed community");
    return { ...post, communityName: row.communityName };
  });
  if (new Set(items.map(row => row.id)).size !== items.length) throw new Error("Duplicate feed post");
  return { items, next: page.next, viewer: page.viewer };
}

export function forYouPageResponse(value: unknown): FeedPage {
  const page = feedPageResponse(value);
  const source = value as { coldStart?: unknown; items: { reason?: unknown }[] };
  if (typeof source.coldStart !== "boolean") throw new Error("Invalid discovery state");
  const items = page.items.map((post, index): FeedPost => {
    const reason = source.items[index].reason;
    if (reason !== "joined" && reason !== "public" || source.coldStart && reason !== "public") throw new Error("Invalid feed reason");
    return { ...post, reason };
  });
  return { ...page, items, coldStart: source.coldStart };
}
