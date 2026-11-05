import "server-only";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, CommunityError, reserveAttempt, withCommunityPostAccess } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { InputError } from "../communities/http.ts";
import { archiveAnchor, archiveCursor, archiveExcerptLimit, archivePageSize, type ArchiveInput } from "./policy.ts";

// Fixed SQL fragments only. Every term, ID, filter and cursor value is bound.
// Prisma's ordinary filters cannot normalize Arabic marks/NFC at read time.
function normalized(text: Prisma.Sql) {
  return Prisma.sql`lower(regexp_replace(normalize(${text}, NFC), ${"[\u0640\u064b-\u0652\u0670]"}, '', 'g'))`;
}
function matches(text: Prisma.Sql, input: ArchiveInput) {
  return Prisma.join(input.terms.map(term => Prisma.sql`strpos(${normalized(text)}, ${term}) > 0`), " AND ");
}
function visible(userId: string) {
  return Prisma.sql`(c.visibility = 'PUBLIC' OR c."ownerId" = ${userId}::uuid OR EXISTS
    (SELECT 1 FROM "CommunityMembership" m WHERE m."communityId" = c.id AND m."userId" = ${userId}::uuid AND m.status = 'MEMBER'))`;
}
function commentMember(userId: string) {
  return Prisma.sql`(c.visibility = 'PUBLIC' OR EXISTS (SELECT 1 FROM "CommunityMembership" m
    WHERE m."communityId" = c.id AND m."userId" = ${userId}::uuid AND m.status = 'MEMBER'))`;
}
function matching(input: ArchiveInput, userId: string) {
  return Prisma.sql`(${matches(Prisma.sql`p.title || ' ' || p.body`, input)} OR (${commentMember(userId)} AND EXISTS
    (SELECT 1 FROM "Comment" x WHERE x."postId" = p.id AND ${matches(Prisma.sql`x.body`, input)})))`;
}
function scope(input: ArchiveInput, userId: string) {
  return Prisma.sql`${visible(userId)} AND ${matching(input, userId)}
    ${input.communityId ? Prisma.sql`AND c.id = ${input.communityId}::uuid` : Prisma.empty}
    ${input.type ? Prisma.sql`AND p.type = ${input.type}::"PostType"` : Prisma.empty}`;
}
type Candidate = { id: string; communityId: string; createdAt: Date };
export function archiveCandidateQuery(input: ArchiveInput, userId: string, anchor?: Candidate) {
  const boundary = anchor ? Prisma.sql`AND (p."createdAt", p.id) < (${anchor.createdAt}, ${anchor.id}::uuid)` : Prisma.empty;
  return Prisma.sql`SELECT p.id, p."communityId", p."createdAt" FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
    WHERE ${scope(input, userId)} ${boundary} ORDER BY p."createdAt" DESC, p.id DESC LIMIT ${archivePageSize + 1}`;
}
export type ArchiveItem = { id: string; communityId: string; communityName: string; title: string; type: string;
  createdAt: Date; authorName: string | null; excerpt: string; commentId: string | null };

export function archiveCommunities(db: PrismaClient, token: unknown, selected?: string) {
  return authorized(db, token, async (tx, userId) => {
    const where = { OR: [{ visibility: "PUBLIC" as const }, { ownerId: userId }, { memberships: { some: { userId, status: "MEMBER" as const } } }] };
    const rows = await tx.community.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], take: 51, select: { id: true, name: true } });
    const items = rows.slice(0, 50);
    if (selected && !items.some(row => row.id === selected)) {
      const row = await tx.community.findFirst({ where: { AND: [where, { id: selected }] }, select: { id: true, name: true } });
      if (!row) throw new CommunityError(404);
      items.push(row);
    }
    return { items, more: rows.length > 50 };
  });
}

export async function searchArchive(db: PrismaClient, token: unknown, input: ArchiveInput, cursorKey: string) {
  await reserveAttempt(db, token, "m4-archive-search");
  return authorized(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    let after: string | undefined;
    try { after = archiveAnchor(input, userId, cursorKey); } catch { throw new InputError("Restart archive search"); }
    const anchor = after ? (await tx.$queryRaw<Candidate[]>(Prisma.sql`SELECT p.id, p."communityId", p."createdAt"
      FROM "Post" p JOIN "Community" c ON c.id = p."communityId" WHERE p.id = ${after}::uuid AND ${scope(input, userId)}`))[0] : undefined;
    if (after && !anchor) throw new CommunityError(404);
    if (input.communityId && !await tx.community.findFirst({ where: { id: input.communityId,
      OR: [{ visibility: "PUBLIC" }, { ownerId: userId }, { memberships: { some: { userId, status: "MEMBER" } } }] }, select: { id: true } })) throw new CommunityError(404);
    // No content projection until these bounded candidates have their locks.
    const candidates = await tx.$queryRaw<Candidate[]>(archiveCandidateQuery(input, userId, anchor));
    const communities = [...new Set([...candidates.map(row => row.communityId), ...(anchor ? [anchor.communityId] : []), ...(input.communityId ? [input.communityId] : [])])].sort();
    for (const id of communities) await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${id}::text, 0))::text`;
    if (input.communityId && !await tx.community.findFirst({ where: { id: input.communityId,
      OR: [{ visibility: "PUBLIC" }, { ownerId: userId }, { memberships: { some: { userId, status: "MEMBER" } } }] }, select: { id: true } })) throw new CommunityError(404);
    if (after && !(await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
      WHERE p.id = ${after}::uuid AND ${scope(input, userId)}`)).length) throw new CommunityError(404);
    const rows = candidates.length ? await tx.$queryRaw<ArchiveItem[]>(Prisma.sql`SELECT p.id, p."communityId", c.name AS "communityName", p.title, p.type,
      p."createdAt", profile."displayName" AS "authorName",
      CASE WHEN ${matches(Prisma.sql`p.title || ' ' || p.body`, input)} THEN left(p.body, ${archiveExcerptLimit}) ELSE left(hit.body, ${archiveExcerptLimit}) END AS excerpt,
      CASE WHEN ${matches(Prisma.sql`p.title || ' ' || p.body`, input)} THEN NULL ELSE hit.id END AS "commentId"
      FROM "Post" p JOIN "Community" c ON c.id = p."communityId" LEFT JOIN "Profile" profile ON profile."userId" = p."authorId"
      LEFT JOIN LATERAL (SELECT x.id, x.body FROM "Comment" x WHERE x."postId" = p.id AND ${commentMember(userId)} AND ${matches(Prisma.sql`x.body`, input)}
        ORDER BY x."createdAt", x.id LIMIT 1) hit ON true
      WHERE p.id IN (${Prisma.join(candidates.map(row => Prisma.sql`${row.id}::uuid`))}) AND ${scope(input, userId)}
      ORDER BY p."createdAt" DESC, p.id DESC`) : [];
    const items = rows.slice(0, archivePageSize);
    return { items, next: rows.length > archivePageSize ? archiveCursor(items.at(-1)!.id, input, userId, cursorKey) : null,
      interrupted: rows.length !== candidates.length };
  });
}

export function archiveCommentTarget(db: PrismaClient, token: unknown, community: string, post: string, value: unknown) {
  const id = communityId(value), postId = communityId(post);
  return withCommunityPostAccess(db, token, community, false, async tx => {
    const row = await tx.comment.findFirst({ where: { id, postId, post: { communityId: community } }, select: { id: true, rootId: true } });
    if (!row) throw new CommunityError(404);
    return { commentId: row.id, rootId: row.rootId ?? row.id };
  }, "m4-archive-search", true);
}
