import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, CommunityError, reserveAttempt } from "../communities/service.ts";
import { validInput } from "../communities/http.ts";
import { digest } from "../identity/policy.ts";
import { postProjection, projectPost } from "../posts/service.ts";
import { voteSummaries } from "../votes/service.ts";
import { feedCursor, feedInput, feedPageSize, feedViewer, verifyFeedCursor } from "./policy.ts";

async function memberships(tx: Prisma.TransactionClient, userId: string) {
  // Prisma does not expose PostgreSQL row versions. Include xmin only in the
  // private cursor scope so leave/rejoin within one timestamp tick is detected.
  // It is not an identity or an authorization credential; live MEMBER checks win.
  const rows = await tx.$queryRaw<{ communityId: string; createdAt: Date; version: string }[]>`
    SELECT "communityId", "createdAt", xmin::text AS version FROM "CommunityMembership"
    WHERE "userId" = ${userId}::uuid AND status = 'MEMBER' ORDER BY "communityId" LIMIT 501`;
  if (rows.length > 500) throw new CommunityError(429);
  // A leave/rejoin creates a new membership and invalidates earlier cursors too.
  return { ids: rows.map(row => row.communityId), scope: digest(JSON.stringify(rows.map(row => [row.communityId, row.createdAt.toISOString(), row.version]))) };
}

export async function listFeed(db: PrismaClient, token: unknown, parameters: URLSearchParams, key: string) {
  const after = validInput(() => feedInput(parameters));
  await reserveAttempt(db, token, "m4-feed-read");
  return authorized(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    const joined = await memberships(tx, userId);
    const eligible: Prisma.PostWhereInput = { communityId: { in: joined.ids },
      community: { memberships: { some: { userId, status: "MEMBER" } } } };
    const anchor = after ? await tx.post.findFirst({ where: { AND: [eligible, { id: after.slice(0, 36) }] },
      select: { id: true, communityId: true, createdAt: true } }) : null;
    if (after && !anchor) throw new CommunityError(404);
    if (after && anchor) {
      try { verifyFeedCursor(after, anchor.createdAt, userId, joined.scope, key); }
      catch { throw new CommunityError(409); }
    }
    // Select metadata only; no title, author, body or vote is read before locks.
    const candidates = await tx.post.findMany({ where: { AND: [eligible, ...(anchor ? [{ OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: feedPageSize + 1,
    select: { id: true, communityId: true, createdAt: true } });
    const ids = [...new Set([...candidates.map(row => row.communityId), ...(anchor ? [anchor.communityId] : [])])].sort();
    // Same lock keys as membership changes, sorted and acquired in one round trip.
    if (ids.length) await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(id::text, 0))::text
      FROM (SELECT unnest(${ids}::uuid[]) AS id ORDER BY id) communities`;
    const current = await memberships(tx, userId);
    if (current.scope !== joined.scope) throw new CommunityError(409);
    if (anchor && !await tx.post.findFirst({ where: { AND: [eligible, { id: anchor.id, createdAt: anchor.createdAt }] }, select: { id: true } })) throw new CommunityError(404);
    const rows = candidates.length ? await tx.post.findMany({ where: { AND: [eligible, { id: { in: candidates.map(row => row.id) } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: feedPageSize + 1,
      select: { ...postProjection, community: { select: { name: true } } } }) : [];
    if (rows.length !== candidates.length) throw new CommunityError(409);
    const visible = rows.slice(0, feedPageSize), votes = await voteSummaries(tx, "post", visible, userId, true);
    const items = visible.map(row => ({ ...projectPost(row, votes.get(row.id)!), communityName: row.community.name }));
    const last = visible.at(-1);
    return { items, next: rows.length > feedPageSize && last ? feedCursor(last.id, last.createdAt, userId, current.scope, key) : null,
      viewer: feedViewer(userId, key) };
  });
}
