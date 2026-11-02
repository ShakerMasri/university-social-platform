import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { CommunityError, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { voteInput, type VoteSummary, type VoteValue } from "./policy.ts";
import { notifyUpvote } from "../notifications/delivery.ts";

type TargetKind = "post" | "comment";
type VoteTarget = { id: string; authorId: string | null };

// Call only with the already-authorized, page-bounded targets inside the same
// community transaction. Two queries per page, never one query per target or a
// voter list. The existing community lock keeps counts/own state consistent.
export async function voteSummaries(tx: Prisma.TransactionClient, kind: TargetKind, targets: VoteTarget[], userId: string, member: boolean) {
  const result = new Map<string, VoteSummary>();
  if (!targets.length) return result;
  const ids = targets.map(target => target.id);
  const counts = new Map<string, { upvotes: number; downvotes: number }>(), own = new Map<string, VoteValue>();
  function count(id: string, value: number, total: number) {
    const summary = counts.get(id) ?? { upvotes: 0, downvotes: 0 };
    if (value === 1) summary.upvotes = total;
    else if (value === -1) summary.downvotes = total;
    counts.set(id, summary);
  }
  if (kind === "post") {
    for (const row of await tx.postVote.groupBy({ by: ["postId", "value"], where: { postId: { in: ids }, value: { in: [-1, 1] } }, _count: { _all: true } })) count(row.postId, row.value, row._count._all);
    for (const row of await tx.postVote.findMany({ where: { postId: { in: ids }, userId }, select: { postId: true, value: true } })) own.set(row.postId, row.value as VoteValue);
  } else {
    for (const row of await tx.commentVote.groupBy({ by: ["commentId", "value"], where: { commentId: { in: ids }, value: { in: [-1, 1] } }, _count: { _all: true } })) count(row.commentId, row.value, row._count._all);
    for (const row of await tx.commentVote.findMany({ where: { commentId: { in: ids }, userId }, select: { commentId: true, value: true } })) own.set(row.commentId, row.value as VoteValue);
  }
  for (const target of targets) {
    const totals = counts.get(target.id) ?? { upvotes: 0, downvotes: 0 };
    result.set(target.id, { ...totals, score: totals.upvotes - totals.downvotes, value: own.get(target.id) ?? 0, canVote: member && target.authorId !== userId });
  }
  return result;
}

export function setVote(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, commentValue: unknown | undefined, input: Record<string, unknown>) {
  const postId = communityId(postValue), commentId = commentValue === undefined ? undefined : communityId(commentValue), { value } = voteInput(input);
  return withCommunityPostAccess(db, token, communityValue, true, async (tx, community, userId) => {
    const post = await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true, authorId: true } });
    if (!post) throw new CommunityError(404);
    const target = commentId ? await tx.comment.findFirst({ where: { id: commentId, postId }, select: { id: true, authorId: true } }) : post;
    if (!target) throw new CommunityError(404);
    if (target.authorId === userId) throw new CommunityError(403);
    // Desired-state writes are safe to repeat after an ambiguous response. The
    // community lock serializes mutations/removal; the PK enforces uniqueness.
    const previous = commentId
      ? await tx.commentVote.findUnique({ where: { commentId_userId: { commentId, userId } }, select: { firstUpvotedAt: true } })
      : await tx.postVote.findUnique({ where: { postId_userId: { postId, userId } }, select: { firstUpvotedAt: true } });
    const firstUpvote = value === 1 && !previous?.firstUpvotedAt;
    const firstUpvotedAt = firstUpvote ? new Date() : null;
    // Keep neutral records only after an actual vote. Their marker survives
    // removal/switching, so preferences/rejoining cannot backfill old upvotes.
    if (previous || value !== 0) {
      const update = { value, ...(firstUpvote ? { firstUpvotedAt } : {}) };
      // Use the locked existence check: PostgreSQL checks an upsert's proposed
      // INSERT before conflict handling, even when the existing marker is valid.
      if (commentId) {
        if (previous) await tx.commentVote.update({ where: { commentId_userId: { commentId, userId } }, data: update });
        else await tx.commentVote.create({ data: { commentId, userId, value, firstUpvotedAt } });
      } else {
        if (previous) await tx.postVote.update({ where: { postId_userId: { postId, userId } }, data: update });
        else await tx.postVote.create({ data: { postId, userId, value, firstUpvotedAt } });
      }
    }
    if (firstUpvote && target.authorId) await notifyUpvote(tx, community.id, userId, target.authorId, postId, commentId ?? null);
    return (await voteSummaries(tx, commentId ? "comment" : "post", [target], userId, true)).get(target.id)!;
  }, "m3-vote-write", Boolean(commentId), false);
}
