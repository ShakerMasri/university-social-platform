// Evaluation-only. The holdout/rule specification was frozen before this code.
import "server-only";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { archiveSourceLimit, type ArchiveSource } from "../../src/server/archive/service.ts";
import { normalizeArchiveText } from "../../src/server/archive/policy.ts";
import { retrieveEvidenceWithRanking } from "./evidence-ranking-experiment.ts";

export const rankingContextLimit = 320;
const contextDiversityLimit = 12;

// No answer vocabulary, intent, gold labels, teacher identity or vote scores.
// Body coverage dominates context diversity. Context length/diversity saturates
// to avoid a whole-document length penalty. This cannot establish usefulness.
export function contextRelevance(body: string, terms: string[]) {
  const text = normalizeArchiveText(body);
  const positions = terms.map(term => text.indexOf(term)).filter(position => position >= 0);
  if (!positions.length) return { bodyTermCoverage: 0, localContext: 0 };
  const first = Array.from(text.slice(0, Math.min(...positions))).length;
  const start = Math.max(0, first - 80);
  const window = Array.from(text).slice(start, start + rankingContextLimit).join("");
  const queryWords = new Set(terms.flatMap(term => term.match(/[\p{L}\p{N}]+/gu) ?? []));
  const context = new Set((window.match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => !queryWords.has(word)));
  return { bodyTermCoverage: positions.length / terms.length, localContext: Math.min(contextDiversityLimit, context.size) };
}

export function rankContextEvidence(sources: ArchiveSource[], terms: string[]) {
  return sources.map(source => ({ source, ...contextRelevance(source.body, terms) }))
    .sort((a, b) => b.bodyTermCoverage - a.bodyTermCoverage || b.localContext - a.localContext ||
      b.source.postCreatedAt.getTime() - a.source.postCreatedAt.getTime() ||
      (a.source.postId < b.source.postId ? 1 : a.source.postId > b.source.postId ? -1 : 0))
    .slice(0, archiveSourceLimit).map(row => row.source);
}

export function retrieveRevisedEvidence(db: PrismaClient, token: unknown, parameters: URLSearchParams) {
  return retrieveEvidenceWithRanking(db, token, parameters, rankContextEvidence);
}
