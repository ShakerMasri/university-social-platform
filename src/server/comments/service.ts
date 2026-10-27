import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { CommunityError, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { digest } from "../identity/policy.ts";
import { commentInput, commentPageSize } from "./policy.ts";

const displayProjection = { id: true, body: true, createdAt: true, author: { select: { profile: { select: { displayName: true } } } } } as const;
function displayComment<T extends { author: { profile: { displayName: string } | null } | null }>(row: T) {
  const { author, ...comment } = row;
  return { ...comment, authorName: author?.profile?.displayName ?? null };
}

export function createComment(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, input: Record<string, unknown>) {
  const postId = communityId(postValue), { requestId, body } = commentInput(input);
  return withCommunityPostAccess(db, token, communityValue, true, async (tx, community, userId) => {
    if (!await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true } })) throw new CommunityError(404);
    // Community write lock serializes duplicate submissions and membership removal.
    const submissionKey = digest(`m3-comment:${postId}:${userId}:${requestId}`);
    const existing = await tx.comment.findUnique({ where: { submissionKey } });
    if (existing) {
      if (existing.authorId !== userId || existing.postId !== postId || existing.body !== body) throw new CommunityError(409);
      return displayComment(await tx.comment.findUniqueOrThrow({ where: { id: existing.id }, select: displayProjection }));
    }
    return displayComment(await tx.comment.create({ data: { postId, authorId: userId, body, submissionKey }, select: displayProjection }));
  }, "m3-comment-write", true);
}

export function listComments(db: PrismaClient, token: unknown, communityValue: unknown, postValue: unknown, cursor?: unknown) {
  const postId = communityId(postValue), after = cursor === undefined ? undefined : communityId(cursor);
  return withCommunityPostAccess(db, token, communityValue, false, async (tx, community, userId, member) => {
    if (!await tx.post.findFirst({ where: { id: postId, communityId: community.id }, select: { id: true } })) throw new CommunityError(404);
    const anchor = after ? await tx.comment.findFirst({ where: { id: after, postId }, select: { id: true, createdAt: true } }) : null;
    if (after && !anchor) throw new CommunityError(404);
    const rows = await tx.comment.findMany({ where: { postId, ...(anchor ? { OR: [
      { createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } },
    ] } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: commentPageSize + 1,
    select: displayProjection });
    const items = rows.slice(0, commentPageSize).map(displayComment);
    return { items, next: rows.length > commentPageSize ? items.at(-1)!.id : null,
      canComment: member && Boolean(await tx.profile.findUnique({ where: { userId }, select: { userId: true } })) };
  }, "m3-comment-write", true);
}
