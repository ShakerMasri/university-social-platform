import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, mutating, CommunityError } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { notificationPageSize, unreadCountLimit } from "./policy.ts";
import { digest } from "../identity/policy.ts";

// Memberships are already capped at 500 by the community service. Snapshot a
// bounded candidate set, lock those communities against membership changes, then
// recheck membership in every query. Newly joined communities appear next read.
// Old records reappear on rejoin, retaining readAt; preferences govern creation.
async function visibleNotifications(tx: Prisma.TransactionClient, userId: string) {
  const memberships = await tx.communityMembership.findMany({ where: { userId, status: "MEMBER" }, select: { communityId: true }, take: 501 });
  if (memberships.length > 500) throw new CommunityError(429);
  const ids = memberships.map(row => row.communityId).sort();
  await tx.$executeRaw`SET LOCAL statement_timeout = '4000ms'`;
  // Prisma has no advisory-lock API. Values are bound, and the database acquires
  // the same shared locks as content reads in one bounded round trip.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(id::text, 0))::text
    FROM (SELECT unnest(${ids}::uuid[]) AS id ORDER BY id) communities`;
  const current = await tx.communityMembership.findMany({ where: { userId, status: "MEMBER", communityId: { in: ids } }, select: { communityId: true }, orderBy: { communityId: "asc" } });
  const where: Prisma.NotificationWhereInput = { recipientId: userId, post: { communityId: { in: current.map(row => row.communityId) }, community: { memberships: { some: { userId, status: "MEMBER" } } } } };
  return { where, scope: digest(`${userId}:${current.map(row => row.communityId).join(":")}`) };
}

const projection = { id: true, kind: true, createdAt: true, readAt: true, post: { select: { title: true } } } as const;
function displayNotification(row: Prisma.NotificationGetPayload<{ select: typeof projection }>) {
  return { id: row.id, kind: row.kind, createdAt: row.createdAt, read: row.readAt !== null, title: row.post.title };
}

export function listNotifications(db: PrismaClient, token: unknown, cursor?: unknown) {
  const after = cursor === undefined ? undefined : communityId(cursor);
  return authorized(db, token, async (tx, userId) => {
    const { where: visible, scope } = await visibleNotifications(tx, userId);
    const anchor = after ? await tx.notification.findFirst({ where: { AND: [visible, { id: after }] }, select: { id: true, createdAt: true } }) : null;
    if (after && !anchor) throw new CommunityError(404);
    const rows = await tx.notification.findMany({ where: { AND: [visible, ...(anchor ? [{ OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: notificationPageSize + 1, select: projection });
    const items = rows.slice(0, notificationPageSize).map(displayNotification);
    const unread = await tx.notification.count({ where: { AND: [visible, { readAt: null }] } });
    return { items, next: rows.length > notificationPageSize ? items.at(-1)!.id : null, unread, scope };
  });
}

/**
 * Unread count for the header, under exactly the list's access rules (the same
 * visibleNotifications scope). Bounded: counts at most unreadCountLimit + 1
 * rows, so a result above the limit means "more than the limit". Read-only.
 */
export function countUnreadNotifications(db: PrismaClient, token: unknown) {
  return authorized(db, token, async (tx, userId) => {
    const { where: visible } = await visibleNotifications(tx, userId);
    return tx.notification.count({ where: { AND: [visible, { readAt: null }] }, take: unreadCountLimit + 1 });
  });
}

// Both opening and the eventual linked page reauthorize this owner-only record.
// A normal public post URL retains its ordinary public-content rules.
// markedRead says whether this call changed the record from unread to read, so
// a client lowers its unread count only once. It is reported only after the
// access check passes; an inaccessible or unknown id is the same 404 as before.
export function notificationTarget(db: PrismaClient, token: unknown, value: unknown, markRead = false) {
  const id = communityId(value);
  const run = async (tx: Prisma.TransactionClient, userId: string) => {
    const { where: visible } = await visibleNotifications(tx, userId);
    const row = await tx.notification.findFirst({ where: { AND: [visible, { id }] }, select: {
      id: true, postId: true, commentId: true, post: { select: { communityId: true } },
      comment: { select: { rootId: true } },
    } });
    if (!row) throw new CommunityError(404);
    let markedRead = false;
    if (markRead) {
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const { count } = await tx.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: clock.now } });
      markedRead = count === 1;
    }
    return { id: row.id, communityId: row.post.communityId, postId: row.postId, commentId: row.commentId, rootId: row.comment?.rootId ?? row.commentId, markedRead };
  };
  return markRead ? mutating(db, token, run, false, "m3-notification-write") : authorized(db, token, run);
}

export function markAllNotificationsRead(db: PrismaClient, token: unknown) {
  return mutating(db, token, async (tx, userId) => {
    const { where: visible } = await visibleNotifications(tx, userId);
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    await tx.notification.updateMany({ where: { AND: [visible, { readAt: null }] }, data: { readAt: clock.now } });
  }, false, "m3-notification-write");
}
