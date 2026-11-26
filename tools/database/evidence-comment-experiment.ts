// Evaluation-only. No application route or production retrieval imports this.
import "server-only";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.ts";
import { archiveSourceLimit, lockedArchiveCandidates, archiveTextMatches, archiveSourceScope,
  archiveCommentMember, archiveSourceProjection, type ArchiveSource } from "../../src/server/archive/service.ts";
import { authorized, reserveAttempt } from "../../src/server/communities/service.ts";
import { validInput } from "../../src/server/communities/http.ts";
import { evidenceInput } from "../../src/server/evidence/policy.ts";
import { projectEvidenceSource } from "../../src/server/evidence/service.ts";

export async function retrieveCommentEvidence(db: PrismaClient, token: unknown, parameters: URLSearchParams) {
  const input = validInput(() => evidenceInput(parameters));
  await reserveAttempt(db, token, "m5-evidence-retrieval");
  return authorized(db, token, async (tx, userId) => {
    const candidates = await lockedArchiveCandidates(tx, userId, input, "");
    const selected = candidates.slice(0, archiveSourceLimit);
    // Only the parent-precedence condition differs from production. All SQL
    // access/matching/projection fragments and locks are the canonical ones.
    // Each selected parent projects at most its earliest matching comment.
    const sources = selected.length ? await tx.$queryRaw<ArchiveSource[]>(Prisma.sql`SELECT ${archiveSourceProjection}
      FROM "Post" p JOIN "Community" c ON c.id = p."communityId"
      LEFT JOIN LATERAL (SELECT x.id, x.body, x."createdAt", x."rootId" FROM "Comment" x
        WHERE x."postId" = p.id AND ${archiveCommentMember(userId)} AND ${archiveTextMatches(Prisma.sql`x.body`, input)}
        AND (p.type = 'QUESTION' OR NOT (${archiveTextMatches(Prisma.sql`p.title || ' ' || p.body`, input)}))
        ORDER BY x."createdAt", x.id LIMIT 1) hit ON true
      WHERE p.id IN (${Prisma.join(selected.map(row => Prisma.sql`${row.id}::uuid`))}) AND ${archiveSourceScope(input, userId)}
      ORDER BY p."createdAt" DESC, p.id DESC`) : [];
    return { evidence: sources.map(source => projectEvidenceSource(source, input.terms)), interrupted: sources.length !== selected.length };
  });
}
