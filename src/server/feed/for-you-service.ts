import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, CommunityError, reserveAttempt } from "../communities/service.ts";
import { validInput } from "../communities/http.ts";
import { postProjection, projectPost } from "../posts/service.ts";
import { voteSummaries } from "../votes/service.ts";
import { feedInput, feedPageSize, feedViewer } from "./policy.ts";
import { feedMemberships } from "./memberships.ts";
import { compareForYou, forYouCursor, groupCutoff, verifyForYouCursor } from "./for-you-policy.ts";

export async function listForYou(db: PrismaClient, token: unknown, parameters: URLSearchParams, key: string) {
  const after = validInput(() => feedInput(parameters));
  await reserveAttempt(db, token, "m4-for-you-read");
  return authorized(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    const joined = await feedMemberships(tx, userId);
    const member: Prisma.PostWhereInput = { communityId: { in: joined.ids },
      community: { memberships: { some: { userId, status: "MEMBER" } } } };
    const discovery: Prisma.PostWhereInput = { community: { visibility: "PUBLIC",
      memberships: { none: { userId, status: "MEMBER" } } } };
    const eligible: Prisma.PostWhereInput = { OR: [member, discovery] };
    const metadata = { id: true, communityId: true, createdAt: true } as const;
    const anchorRow = after ? await tx.post.findFirst({ where: { AND: [eligible, { id: after.slice(0, 36) }] }, select: metadata }) : null;
    if (after && !anchorRow) throw new CommunityError(404);
    const joinedIds = new Set(joined.ids);
    const anchor = anchorRow ? { ...anchorRow, currentMember: joinedIds.has(anchorRow.communityId) } : null;
    if (after && anchor) {
      try { verifyForYouCursor(after, anchor, userId, joined.scope, key); }
      catch { throw new CommunityError(409); }
    }
    async function group(where: Prisma.PostWhereInput, currentMember: boolean) {
      // Convert the GLOBAL rank boundary back to this group's publication time.
      const cutoff = anchor ? groupCutoff(anchor, currentMember) : null;
      return (await tx.post.findMany({ where: { AND: [where, ...(cutoff && anchor ? [{ OR: [
        { createdAt: { lt: cutoff } }, { createdAt: cutoff, id: { lt: anchor.id } },
      ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: feedPageSize + 1,
      select: metadata })).map(row => ({ ...row, currentMember }));
    }
    // Two disjoint groups, at most 42 metadata rows, then 21 protected targets.
    const candidates = [...await group(member, true), ...await group(discovery, false)]
      .sort(compareForYou).slice(0, feedPageSize + 1);
    const communities = [...new Set([...candidates.map(row => row.communityId), ...(anchor ? [anchor.communityId] : [])])].sort();
    if (communities.length) await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(id::text, 0))::text
      FROM (SELECT unnest(${communities}::uuid[]) AS id ORDER BY id) communities`;
    const current = await feedMemberships(tx, userId);
    if (current.scope !== joined.scope) throw new CommunityError(409);
    if (anchor && !await tx.post.findFirst({ where: { AND: [eligible,
      { id: anchor.id, communityId: anchor.communityId, createdAt: anchor.createdAt }] }, select: { id: true } })) throw new CommunityError(404);
    const rows = candidates.length ? await tx.post.findMany({ where: { AND: [eligible, { id: { in: candidates.map(row => row.id) } }] },
      take: feedPageSize + 1, select: { ...postProjection, community: { select: { name: true } } } }) : [];
    if (rows.length !== candidates.length) throw new CommunityError(409);
    const byId = new Map(rows.map(row => [row.id, row]));
    const ordered = candidates.map(candidate => {
      const row = byId.get(candidate.id)!;
      if (row.createdAt.getTime() !== candidate.createdAt.getTime() || row.communityId !== candidate.communityId) throw new CommunityError(409);
      return { row, currentMember: candidate.currentMember };
    });
    const visible = ordered.slice(0, feedPageSize);
    // Exactly two batched vote queries, regardless of the number of communities.
    const votes = await voteSummaries(tx, "post", visible.map(item => item.row), userId, true);
    const items = visible.map(({ row, currentMember }) => {
      const vote = votes.get(row.id)!;
      return { ...projectPost(row, { ...vote, canVote: currentMember && vote.canVote }), communityName: row.community.name,
        reason: currentMember ? "joined" as const : "public" as const };
    });
    const last = candidates[feedPageSize - 1];
    return { items, next: ordered.length > feedPageSize && last ? forYouCursor(last, userId, current.scope, key) : null,
      viewer: feedViewer(userId, key), coldStart: current.ids.length === 0 };
  });
}
