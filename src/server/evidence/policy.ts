import { archiveInput, normalizeArchiveText } from "../archive/policy.ts";
import { communityId } from "../communities/policy.ts";
import { isLocale } from "../../i18n/locales.ts";
import type { Locale } from "../../i18n/locales.ts";

export const evidenceTextLimit = 1200;
export type EvidenceCitation = { communityId: string; postId: string; commentId: string | null };
export type EvidenceReference = { sourceId: string; citation: EvidenceCitation; fingerprint: string };
export type Evidence = EvidenceReference & {
  kind: "post" | "comment" | "reply"; title: string; text: string;
  createdAt: string; postCreatedAt: string; truncated: boolean;
};

export function evidenceInput(parameters: URLSearchParams) {
  if (parameters.has("after")) throw new Error("Evidence pagination is unavailable");
  return archiveInput(parameters);
}

function citationTarget(value: unknown): EvidenceCitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid citation target");
  const target = value as Record<string, unknown>;
  if (Object.keys(target).some(key => !["communityId", "postId", "commentId"].includes(key))) throw new Error("Invalid citation target");
  return { communityId: communityId(target.communityId), postId: communityId(target.postId),
    commentId: target.commentId === null ? null : communityId(target.commentId) };
}

export function evidenceSourceId(citation: EvidenceCitation) {
  return citation.commentId === null ? `post:${citation.postId}` : `comment:${citation.commentId}`;
}

// Only references are accepted back. Caller-supplied text, titles and URLs never
// establish evidence or access. The service re-reads the actual database rows.
export function evidenceReferences(value: unknown, maximum: number): EvidenceReference[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("Invalid evidence references");
  const references = value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid evidence reference");
    const row = item as Record<string, unknown>, citation = citationTarget(row.citation);
    if (row.sourceId !== evidenceSourceId(citation) || typeof row.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.fingerprint)) throw new Error("Invalid evidence reference");
    return { sourceId: row.sourceId, citation, fingerprint: row.fingerprint };
  });
  if (new Set(references.map(row => row.sourceId)).size !== references.length) throw new Error("Duplicate evidence reference");
  return references;
}

// Builds an internal destination only; this helper is not an authorization check.
export function evidenceCitationPath(target: EvidenceCitation, locale: Locale) {
  if (!isLocale(locale)) throw new Error("Invalid citation locale");
  const citation = citationTarget(target);
  return `/${locale}/communities/${citation.communityId}/posts/${citation.postId}${citation.commentId === null ? "" : `?comment=${citation.commentId}`}`;
}

// Keep original text and code-point boundaries, even when normalization removes
// Arabic marks or composes characters. The window includes the earliest term;
// it does not promise all terms fit or that the passage answers the question.
export function evidencePassage(text: string, terms: string[]) {
  const points = Array.from(text), offsets: number[] = [], normalized: string[] = [];
  let offset = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    const part = normalizeArchiveText(segment);
    normalized.push(part);
    for (let index = 0; index < part.length; index++) offsets.push(offset);
    offset += Array.from(segment).length;
  }
  const searchable = normalized.join("");
  const matches = terms.map(term => searchable.indexOf(term)).filter(index => index >= 0);
  const first = matches.length ? offsets[Math.min(...matches)] : 0;
  const start = Math.min(Math.max(0, first - 160), Math.max(0, points.length - evidenceTextLimit));
  return { text: points.slice(start, start + evidenceTextLimit).join(""), truncated: points.length > evidenceTextLimit };
}
