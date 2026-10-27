import { communityId } from "@/server/communities/policy";
import { postPageSize, postTypes } from "@/server/posts/policy";
import { commentPageSize } from "@/server/comments/policy";
import type { listComments } from "@/server/comments/service";
import type { listPosts } from "@/server/posts/service";

export type CommentItem = Awaited<ReturnType<typeof listComments>>["items"][number];
export type PostItem = Awaited<ReturnType<typeof listPosts>>["items"][number];
export type ContentPage<T> = { items: T[]; next: string | null };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid content response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid content text");
  return value;
}
function attribution(row: Record<string, unknown>) {
  const createdAt = new Date(text(row.createdAt));
  if (!Number.isFinite(createdAt.getTime())) throw new Error("Invalid content date");
  return { id: communityId(row.id), body: text(row.body), createdAt,
    authorName: row.authorName === null ? null : text(row.authorName) };
}
export function commentResponse(value: unknown): CommentItem {
  return attribution(record(value));
}
function postResponse(value: unknown): PostItem {
  const row = record(value);
  const type = postTypes.find(type => type === row.type);
  if (!type) throw new Error("Invalid post type");
  return { ...attribution(row), communityId: communityId(row.communityId), type, title: text(row.title),
    resourceUrl: row.resourceUrl === null ? null : text(row.resourceUrl) };
}
function page<T>(value: unknown, item: (value: unknown) => T, maximum: number): ContentPage<T> {
  const row = record(value);
  if (row.ok !== true || !Array.isArray(row.items) || row.items.length > maximum) throw new Error("Invalid content page");
  return { items: row.items.map(item), next: row.next === null ? null : communityId(row.next) };
}
export const commentPageResponse = (value: unknown) => page(value, commentResponse, commentPageSize);
export const postPageResponse = (value: unknown) => page(value, postResponse, postPageSize);
