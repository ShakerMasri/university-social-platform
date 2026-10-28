import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { CommunityError, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { digest } from "../identity/policy.ts";
import { commentInput, commentPageSize } from "./policy.ts";
import { voteSummaries } from "../votes/service.ts";
import type { VoteSummary } from "../votes/policy.ts";
import { notifyContent } from "../notifications/delivery.ts";

const displayProjection = { id: true, authorId: true, body: true, createdAt: true, rootId: true, replyToId: true,
  replyTo: { select: { author: { select: { profile: { select: { displayName: true } } } } } },
  author: { select: { profile: { select: { displayName: true } } } } } as const;
function displayComment(row: Prisma.CommentGetPayload<{ select: typeof displayProjection }>, vote: VoteSummary) {
  return { id: row.id, body: row.body, createdAt: row.createdAt, authorName: row.author?.profile?.displayName ?? null, vote,
    rootId: row.rootId, replyToId: row.replyToId, replyToName: row.replyTo?.author?.profile?.displayName ?? null };
}

export function createComment(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, input: Record<string, unknown>) {
  const postId = communityId(postValue), { requestId, body, replyToId } = commentInput(input);
  return withCommunityPostAccess(db, token, communityValue, true, async (tx, community, userId) => {
    const post = await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true, authorId: true } });
    if (!post) throw new CommunityError(404);
    const parent = replyToId ? await tx.comment.findFirst({ where: { id: replyToId, postId }, select: { id: true, rootId: true, authorId: true } }) : null;
    if (replyToId && !parent) throw new CommunityError(404);
    // Community write lock serializes duplicate submissions and membership removal.
    const submissionKey = digest(`m3-comment:${postId}:${userId}:${requestId}`);
    const existing = await tx.comment.findUnique({ where: { submissionKey } });
    if (existing && (existing.authorId !== userId || existing.postId !== postId || existing.body !== body || existing.replyToId !== replyToId)) throw new CommunityError(409);
    const row = existing
      ? await tx.comment.findUniqueOrThrow({ where: { id: existing.id }, select: displayProjection })
      : await tx.comment.create({ data: { postId, authorId: userId, body, submissionKey, replyToId, rootId: parent ? parent.rootId ?? parent.id : null }, select: displayProjection });
    if (!existing) await notifyContent(tx, community.id, userId, postId, row.id, [post.authorId, parent?.authorId].filter((id): id is string => Boolean(id)));
    return displayComment(row, (await voteSummaries(tx, "comment", [row], userId, true)).get(row.id)!);
  }, "m3-comment-write", true);
}

export function listComments(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, cursor?: unknown, rootValue?: unknown, startValue?: unknown) {
  const postId = communityId(postValue), after = cursor === undefined ? undefined : communityId(cursor);
  const rootId = rootValue === undefined ? null : communityId(rootValue);
  const start = startValue === undefined ? undefined : communityId(startValue);
  if (after && start) throw new CommunityError(404);
  return withCommunityPostAccess(db, token, communityValue, false, async (tx, community, userId, member) => {
    if (!await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true } })) throw new CommunityError(404);
    if (rootId && !await tx.comment.findFirst({ where: { id: rootId, postId, rootId: null }, select: { id: true } })) throw new CommunityError(404);
    const anchor = after || start ? await tx.comment.findFirst({ where: { id: after ?? start, postId, rootId }, select: { id: true, createdAt: true } }) : null;
    if ((after || start) && !anchor) throw new CommunityError(404);
    const rows = await tx.comment.findMany({ where: { postId, rootId, ...(anchor ? { OR: [
      { createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: start ? { gte: anchor.id } : { gt: anchor.id } },
    ] } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: commentPageSize + 1,
    select: displayProjection });
    const visible = rows.slice(0, commentPageSize), votes = await voteSummaries(tx, "comment", visible, userId, member);
    const items = visible.map(row => displayComment(row, votes.get(row.id)!));
    return { items, next: rows.length > commentPageSize ? items.at(-1)!.id : null,
      canComment: member && Boolean(await tx.profile.findUnique({ where: { userId }, select: { userId: true } })) };
  }, "m3-comment-write", true);
}
