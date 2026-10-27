import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { CommunityError, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { digest } from "../identity/policy.ts";
import { postInput, postPageSize } from "./policy.ts";

const projection = { id: true, communityId: true, type: true, title: true, body: true, resourceUrl: true,
  createdAt: true, author: { select: { profile: { select: { displayName: true } } } } } as const;
function publicPost<T extends { author: { profile: { displayName: string } | null } | null }>(row: T) {
  const { author, ...post } = row;
  return { ...post, authorName: author?.profile?.displayName ?? null };
}
export function createPost(db: PrismaClient, token: unknown, value: unknown, input: Record<string, unknown>) {
  const { requestId, ...data } = postInput(input);
  return withCommunityPostAccess(db, token, value, true, async (tx, community, userId) => {
    if (data.type === "ANNOUNCEMENT" && community.ownerId !== userId) throw new CommunityError(403);
    // Client retry IDs are scoped to the authenticated actor and target; neither
    // the raw ID nor this opaque key is exposed in post projections or logs.
    const submissionKey = digest(`m3-post:${community.id}:${userId}:${requestId}`);
    const existing = await tx.post.findUnique({ where: { submissionKey } });
    if (existing) {
      if (existing.authorId !== userId || existing.communityId !== community.id || existing.type !== data.type ||
          existing.title !== data.title || existing.body !== data.body || existing.resourceUrl !== data.resourceUrl) throw new CommunityError(409);
      return { id: existing.id };
    }
    return tx.post.create({ data: { ...data, communityId: community.id, authorId: userId, submissionKey }, select: { id: true } });
  });
}
export function listPosts(db: PrismaClient, token: unknown, value: unknown, cursor?: unknown) {
  const after = cursor === undefined ? undefined : communityId(cursor);
  return withCommunityPostAccess(db, token, value, false, async (tx, community, userId, membership) => {
    const anchor = after ? await tx.post.findFirst({ where: { id: after, communityId: community.id }, select: { id: true, createdAt: true } }) : null;
    if (after && !anchor) throw new CommunityError(404);
    const rows = await tx.post.findMany({ where: { communityId: community.id, ...(anchor ? { OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: postPageSize + 1, select: projection });
    const items = rows.slice(0, postPageSize).map(publicPost);
    return { items, next: rows.length > postPageSize ? items.at(-1)!.id : null,
      canPost: membership && Boolean(await tx.profile.findUnique({ where: { userId }, select: { userId: true } })),
      canAnnounce: community.ownerId === userId };
  });
}
export function readPost(db: PrismaClient, token: unknown, value: unknown, postValue: unknown) {
  const id = communityId(postValue);
  return withCommunityPostAccess(db, token, value, false, async (tx, community) => {
    const post = await tx.post.findFirst({ where: { id, communityId: community.id }, select: projection });
    if (!post) throw new CommunityError(404);
    return publicPost(post);
  });
}
