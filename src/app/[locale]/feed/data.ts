import { postResponse, type PostItem } from "../communities/content-data";

export type FeedPost = PostItem & { communityName: string };
export type FeedPage = { items: FeedPost[]; next: string | null; viewer: string };
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
