// Evaluation-only: no application imports this module. Keep the raw query and
// source-selection contract; change only ordering within 21 recent candidates.
import "server-only";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.ts";
import { archiveCandidateQuery, archiveSourceLimit, type ArchiveSource } from "../../src/server/archive/service.ts";
import { archivePageSize, normalizeArchiveText } from "../../src/server/archive/policy.ts";
import { authorized, CommunityError, reserveAttempt } from "../../src/server/communities/service.ts";
import { validInput } from "../../src/server/communities/http.ts";
import { digest } from "../../src/server/identity/policy.ts";
import { evidenceInput, evidencePassage, evidenceSourceId, type Evidence } from "../../src/server/evidence/policy.ts";

export const rankingCandidateLimit = archivePageSize + 1;

// Capped literal term frequency / sqrt(code-point length). No corpus labels,
// answer words, age bonus, language-specific stop words or semantic claims.
// Capping each term at three occurrences limits, but cannot prevent, stuffing.
export function lexicalDensity(title: string, body: string, terms: string[]) {
  const text = normalizeArchiveText(`${title}\n${body}`);
  let occurrences = 0;
  for (const term of terms) {
    let start = 0;
    for (let count = 0; count < 3; count++) {
      const position = text.indexOf(term, start);
      if (position < 0) break;
      occurrences++; start = position + term.length;
    }
  }
  return occurrences / Math.sqrt(Math.max(1, Array.from(text).length));
}

export function rankEvidenceSources(sources: ArchiveSource[], terms: string[]) {
  return sources.map(source => ({ source, score: lexicalDensity(source.title, source.body, terms) }))
    .sort((a, b) => b.score - a.score || b.source.postCreatedAt.getTime() - a.source.postCreatedAt.getTime() ||
      (a.source.postId < b.source.postId ? 1 : a.source.postId > b.source.postId ? -1 : 0))
    .slice(0, archiveSourceLimit).map(row => row.source);
}

// These two fixed SQL fragments mirror archive source projection only. Candidate
// eligibility/access and its 21-row cap come from the unchanged production query.
function matches(text: Prisma.Sql, terms: string[]) {
  return Prisma.join(terms.map(term => Prisma.sql`strpos(lower(regexp_replace(normalize(${text}, NFC),
    ${"[\u0640\u064b-\u0652\u0670]"}, '', 'g')), ${term}) > 0`), " AND ");
}

export async function retrieveRankedEvidence(db: PrismaClient, token: unknown, parameters: URLSearchParams) {
  return retrieveEvidenceWithRanking(db, token, parameters, rankEvidenceSources);
}

// Both experimental scorers use one experimental access/projection pipeline.
// This is NOT a production extension point: its remaining mirrors of archive
// locking/filter/comment SQL and evidence fingerprints must be shared upstream
// before any adoption. Rankers receive only live, bounded permitted sources.
export async function retrieveEvidenceWithRanking(db: PrismaClient, token: unknown, parameters: URLSearchParams,
  rankSources: (sources: ArchiveSource[], terms: string[]) => ArchiveSource[]) {
  const input = validInput(() => evidenceInput(parameters));
  await reserveAttempt(db, token, "m5-evidence-retrieval");
  return authorized(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    async function checkFilter() {
      if (input.communityId && !await tx.community.findFirst({ where: { id: input.communityId,
        OR: [{ visibility: "PUBLIC" }, { ownerId: userId }, { memberships: { some: { userId, status: "MEMBER" } } }] }, select: { id: true } })) throw new CommunityError(404);
    }
    await checkFilter();
    const candidates = await tx.$queryRaw<{ id: string; communityId: string; createdAt: Date }[]>(archiveCandidateQuery(input, userId));
    for (const id of [...new Set([...candidates.map(row => row.communityId), ...(input.communityId ? [input.communityId] : [])])].sort()) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${id}::text, 0))::text`;
    }
    await checkFilter();
    // Re-run live access/matching under the locks BEFORE projecting any text.
    // Intersect with the original IDs: a newly eligible community is not locked.
    const current = candidates.length ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT eligible.id FROM
      (${archiveCandidateQuery(input, userId)}) eligible WHERE eligible.id IN (${Prisma.join(candidates.map(row => Prisma.sql`${row.id}::uuid`))})`) : [];
    const sources = current.length ? await tx.$queryRaw<ArchiveSource[]>(Prisma.sql`SELECT p."communityId", p.id AS "postId", p.title,
      p."createdAt" AS "postCreatedAt", hit.id AS "commentId", hit."rootId",
      COALESCE(hit."createdAt", p."createdAt") AS "createdAt", CASE WHEN hit.id IS NULL THEN p.body ELSE hit.body END AS body
      FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
      LEFT JOIN LATERAL (SELECT x.id, x.body, x."createdAt", x."rootId" FROM "Comment" x
        WHERE x."postId" = p.id AND (c.visibility = 'PUBLIC' OR EXISTS (SELECT 1 FROM "CommunityMembership" m
          WHERE m."communityId" = c.id AND m."userId" = ${userId}::uuid AND m.status = 'MEMBER'))
        AND ${matches(Prisma.sql`x.body`, input.terms)} AND NOT (${matches(Prisma.sql`p.title || ' ' || p.body`, input.terms)})
        ORDER BY x."createdAt", x.id LIMIT 1) hit ON true
      WHERE p.id IN (${Prisma.join(current.map(row => Prisma.sql`${row.id}::uuid`))})`) : [];
    const evidence: Evidence[] = rankSources(sources, input.terms).map(source => {
      const citation = { communityId: source.communityId, postId: source.postId, commentId: source.commentId };
      const fingerprint = digest(JSON.stringify(["m5-source-v1", source.communityId, source.postId, source.commentId, source.rootId,
        source.title, source.postCreatedAt.toISOString(), source.createdAt.toISOString(), source.body]));
      const bodyMatches = input.terms.some(term => normalizeArchiveText(source.body).includes(term));
      const passage = source.commentId === null && !bodyMatches ? `${source.title}\n${source.body}` : source.body;
      return { sourceId: evidenceSourceId(citation), citation, fingerprint,
        kind: source.commentId === null ? "post" : source.rootId === null ? "comment" : "reply", title: source.title,
        ...evidencePassage(passage, input.terms), createdAt: source.createdAt.toISOString(), postCreatedAt: source.postCreatedAt.toISOString() };
    });
    return { evidence, interrupted: sources.length !== candidates.length };
  });
}
