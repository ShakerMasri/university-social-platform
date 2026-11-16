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

async function lockArchiveCommunities(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${id}::text, 0))::text`;
}

// Shared selection/locking boundary for archive pages and server-only evidence.
async function lockedArchiveCandidates(tx: Prisma.TransactionClient, userId: string, input: ArchiveInput, cursorKey: string) {
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
  await lockArchiveCommunities(tx, [...candidates.map(row => row.communityId), ...(anchor ? [anchor.communityId] : []), ...(input.communityId ? [input.communityId] : [])]);
  if (input.communityId && !await tx.community.findFirst({ where: { id: input.communityId,
    OR: [{ visibility: "PUBLIC" }, { ownerId: userId }, { memberships: { some: { userId, status: "MEMBER" } } }] }, select: { id: true } })) throw new CommunityError(404);
  if (after && !(await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
    WHERE p.id = ${after}::uuid AND ${scope(input, userId)}`)).length) throw new CommunityError(404);
  return candidates;
}

export async function searchArchive(db: PrismaClient, token: unknown, input: ArchiveInput, cursorKey: string) {
  await reserveAttempt(db, token, "m4-archive-search");
  return authorized(db, token, async (tx, userId) => {
    const candidates = await lockedArchiveCandidates(tx, userId, input, cursorKey);
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

export const archiveSourceLimit = 5;
export type ArchiveSourceTarget = { communityId: string; postId: string; commentId: string | null };
export type ArchiveSource = ArchiveSourceTarget & { title: string; body: string; createdAt: Date; postCreatedAt: Date; rootId: string | null };
const sourceProjection = Prisma.sql`p."communityId", p.id AS "postId", p.title, p."createdAt" AS "postCreatedAt",
  hit.id AS "commentId", hit."rootId", COALESCE(hit."createdAt", p."createdAt") AS "createdAt",
  CASE WHEN hit.id IS NULL THEN p.body ELSE hit.body END AS body`;

// Uses the exact archive match/access rules, without the archive's profile join.
// Input comes from evidenceInput; no cursors, external links or arbitrary SQL.
export async function searchArchiveSources(db: PrismaClient, token: unknown, input: ArchiveInput) {
  if (input.after) throw new InputError("Evidence pagination is unavailable");
  await reserveAttempt(db, token, "m5-evidence-retrieval");
  return authorized(db, token, async (tx, userId) => {
    const candidates = await lockedArchiveCandidates(tx, userId, input, "");
    const selected = candidates.slice(0, archiveSourceLimit);
    const sources = selected.length ? await tx.$queryRaw<ArchiveSource[]>(Prisma.sql`SELECT ${sourceProjection}
      FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
      LEFT JOIN LATERAL (SELECT x.id, x.body, x."createdAt", x."rootId" FROM "Comment" x
        WHERE x."postId" = p.id AND ${commentMember(userId)} AND ${matches(Prisma.sql`x.body`, input)}
        AND NOT (${matches(Prisma.sql`p.title || ' ' || p.body`, input)}) ORDER BY x."createdAt", x.id LIMIT 1) hit ON true
      WHERE p.id IN (${Prisma.join(selected.map(row => Prisma.sql`${row.id}::uuid`))}) AND ${scope(input, userId)}
      ORDER BY p."createdAt" DESC, p.id DESC`) : [];
    return { sources, interrupted: sources.length !== selected.length };
  });
}

// Re-read every source under one live session and sorted community locks. A
// missing/denied target fails the whole batch; never return partially valid data.
export async function readArchiveSources(db: PrismaClient, token: unknown, targets: ArchiveSourceTarget[]) {
  if (targets.length > archiveSourceLimit) throw new InputError("Too many evidence sources");
  await reserveAttempt(db, token, "m5-evidence-revalidation");
  return authorized(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    await lockArchiveCommunities(tx, targets.map(target => target.communityId));
    const sources: ArchiveSource[] = [];
    for (const target of targets) {
      const rows = await tx.$queryRaw<ArchiveSource[]>(Prisma.sql`SELECT ${sourceProjection}
        FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
        LEFT JOIN "Comment" hit ON hit.id = ${target.commentId}::uuid AND hit."postId" = p.id
        WHERE c.id = ${target.communityId}::uuid AND p.id = ${target.postId}::uuid AND ${visible(userId)}
        AND (${target.commentId}::uuid IS NULL OR (${commentMember(userId)} AND hit.id IS NOT NULL))`);
      if (!rows[0]) throw new CommunityError(404);
      sources.push(rows[0]);
    }
    return sources;
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
