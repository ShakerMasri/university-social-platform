import { communityId } from "@/server/communities/policy";
import { notificationPageSize } from "@/server/notifications/policy";
import type { listNotifications } from "@/server/notifications/service";
export type NotificationItem = Awaited<ReturnType<typeof listNotifications>>["items"][number];
export function notificationPageResponse(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid notifications");
  const page = value as Record<string, unknown>;
  if (page.ok !== true || !Array.isArray(page.items) || page.items.length > notificationPageSize || !Number.isSafeInteger(page.unread) || (page.unread as number) < 0 || typeof page.scope !== "string" || !/^[a-f0-9]{64}$/.test(page.scope)) throw new Error("Invalid notifications");
  const items: NotificationItem[] = page.items.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid notification");
    const row = value as Record<string, unknown>;
    if (!["ANNOUNCEMENT", "COMMENT", "UPVOTE"].includes(row.kind as string) || typeof row.read !== "boolean" || typeof row.title !== "string" || typeof row.createdAt !== "string") throw new Error("Invalid notification");
    const createdAt = new Date(row.createdAt);
    if (!Number.isFinite(createdAt.getTime())) throw new Error("Invalid notification");
    return { id: communityId(row.id), kind: row.kind as NotificationItem["kind"], title: row.title, read: row.read, createdAt };
  });
  return { items, next: page.next === null ? null : communityId(page.next), unread: page.unread as number, scope: page.scope };
}

/**
 * The open endpoint's answer for `expectedId`: where to go, and whether this
 * request marked the notification read (so the header lowers its count once).
 */
export function notificationOpenResponse(value: unknown, expectedId: string) {
  if (!value || typeof value !== "object") throw new Error("Invalid destination");
  const row = value as Record<string, unknown>;
  if (row.ok !== true || communityId(row.id) !== expectedId || typeof row.markedRead !== "boolean") throw new Error("Invalid destination");
  return { communityId: communityId(row.communityId), postId: communityId(row.postId), markedRead: row.markedRead };
}
