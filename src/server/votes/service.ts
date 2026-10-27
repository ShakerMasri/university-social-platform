import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { CommunityError, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { voteInput, type VoteSummary } from "./policy.ts";

type TargetKind = "post" | "comment";
type VoteTarget = { id: string; authorId: string | null };

// Call only with the already-authorized, page-bounded targets inside the same
// community transaction. Two queries per page, never one query per target or a
// voter list. The existing community lock keeps counts/own state consistent.
export async function voteSummaries(tx: Prisma.TransactionClient, kind: TargetKind, targets: VoteTarget[], userId: string, member: boolean) {
  const result = new Map<string, VoteSummary>();
  if (!targets.length) return result;
  const ids = targets.map(target => target.id);
  const counts = new Map<string, number>(), active = new Set<string>();
  if (kind === "post") {
    for (const row of await tx.postVote.groupBy({ by: ["postId"], where: { postId: { in: ids } }, _count: { _all: true } })) counts.set(row.postId, row._count._all);
    for (const row of await tx.postVote.findMany({ where: { postId: { in: ids }, userId }, select: { postId: true } })) active.add(row.postId);
  } else {
    for (const row of await tx.commentVote.groupBy({ by: ["commentId"], where: { commentId: { in: ids } }, _count: { _all: true } })) counts.set(row.commentId, row._count._all);
    for (const row of await tx.commentVote.findMany({ where: { commentId: { in: ids }, userId }, select: { commentId: true } })) active.add(row.commentId);
  }
  for (const target of targets) result.set(target.id, { count: counts.get(target.id) ?? 0, active: active.has(target.id), canVote: member && target.authorId !== userId });
  return result;
}

export function setVote(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, commentValue: unknown | undefined, input: Record<string, unknown>) {
  const postId = communityId(postValue), commentId = commentValue === undefined ? undefined : communityId(commentValue), { active } = voteInput(input);
  return withCommunityPostAccess(db, token, communityValue, true, async (tx, community, userId) => {
    const post = await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true, authorId: true } });
    if (!post) throw new CommunityError(404);
    const target = commentId ? await tx.comment.findFirst({ where: { id: commentId, postId }, select: { id: true, authorId: true } }) : post;
    if (!target) throw new CommunityError(404);
    if (target.authorId === userId) throw new CommunityError(403);
    // Desired-state writes are safe to repeat after an ambiguous response. The
    // community lock serializes mutations/removal; the PK enforces uniqueness.
    if (commentId) {
      if (active) await tx.commentVote.createMany({ data: [{ commentId, userId }], skipDuplicates: true });
      else await tx.commentVote.deleteMany({ where: { commentId, userId } });
    } else {
      if (active) await tx.postVote.createMany({ data: [{ postId, userId }], skipDuplicates: true });
      else await tx.postVote.deleteMany({ where: { postId, userId } });
    }
    return (await voteSummaries(tx, commentId ? "comment" : "post", [target], userId, true)).get(target.id)!;
  }, "m3-vote-write", Boolean(commentId), false);
}
