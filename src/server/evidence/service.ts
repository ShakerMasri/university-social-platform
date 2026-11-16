import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { archiveSourceLimit, readArchiveSources, searchArchiveSources, type ArchiveSource } from "../archive/service.ts";
import { normalizeArchiveText } from "../archive/policy.ts";
import { CommunityError } from "../communities/service.ts";
import { validInput } from "../communities/http.ts";
import { digest } from "../identity/policy.ts";
import { evidenceInput, evidencePassage, evidenceReferences, evidenceSourceId, type Evidence, type EvidenceCitation } from "./policy.ts";

function sourceFingerprint(source: ArchiveSource) {
  return digest(JSON.stringify(["m5-source-v1", source.communityId, source.postId, source.commentId, source.rootId,
    source.title, source.postCreatedAt.toISOString(), source.createdAt.toISOString(), source.body]));
}

// Local platform content only. These results contain untrusted source text and
// are not cleared for export to an external model or for shared caching.
export async function retrieveEvidence(db: PrismaClient, token: unknown, parameters: URLSearchParams) {
  const input = validInput(() => evidenceInput(parameters));
  const { sources, interrupted } = await searchArchiveSources(db, token, input);
  const evidence: Evidence[] = sources.map(source => {
    const citation: EvidenceCitation = { communityId: source.communityId, postId: source.postId, commentId: source.commentId };
    // Prefer matching body context over a repeated title. The title is retained
    // separately, including when query terms are split across title and body.
    const normalizedBody = normalizeArchiveText(source.body);
    const bodyMatches = input.terms.some(term => normalizedBody.includes(term));
    const passageText = source.commentId === null && !bodyMatches ? `${source.title}\n${source.body}` : source.body;
    return { sourceId: evidenceSourceId(citation), citation, fingerprint: sourceFingerprint(source),
      kind: source.commentId === null ? "post" : source.rootId === null ? "comment" : "reply", title: source.title,
      ...evidencePassage(passageText, input.terms),
      createdAt: source.createdAt.toISOString(), postCreatedAt: source.postCreatedAt.toISOString() };
  });
  return { evidence, interrupted };
}

// Revalidate ALL model inputs, including uncited sources, immediately before a
// future answer is released. On denial/change discard the whole derived answer.
// Success is a current check, not a durable permission or a citation-support proof.
export async function revalidateEvidence(db: PrismaClient, token: unknown, value: unknown): Promise<void> {
  const references = validInput(() => evidenceReferences(value, archiveSourceLimit));
  const current = await readArchiveSources(db, token, references.map(row => row.citation));
  if (current.length !== references.length || current.some((source, index) =>
    evidenceSourceId(source) !== references[index].sourceId || sourceFingerprint(source) !== references[index].fingerprint)) throw new CommunityError(404);
}
