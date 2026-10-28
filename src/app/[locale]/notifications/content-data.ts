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
    if ((row.kind !== "ANNOUNCEMENT" && row.kind !== "COMMENT") || typeof row.read !== "boolean" || typeof row.title !== "string" || typeof row.createdAt !== "string") throw new Error("Invalid notification");
    const createdAt = new Date(row.createdAt);
    if (!Number.isFinite(createdAt.getTime())) throw new Error("Invalid notification");
    return { id: communityId(row.id), kind: row.kind, title: row.title, read: row.read, createdAt };
  });
  return { items, next: page.next === null ? null : communityId(page.next), unread: page.unread as number, scope: page.scope };
}
