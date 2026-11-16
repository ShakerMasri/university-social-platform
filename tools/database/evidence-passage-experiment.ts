// Evaluation-only: no retrieval, database, provider, cache or production hook.
import "server-only";
import { normalizeArchiveText } from "../../src/server/archive/policy.ts";
import { evidenceTextLimit, type Evidence } from "../../src/server/evidence/policy.ts";
import { postBodyLimit, postTitleLimit } from "../../src/server/posts/policy.ts";

export const passageInputLimit = postBodyLimit + postTitleLimit + 1;
export const passageGapMarker = "\n[…]\n";
export type PassageSegment = { start: number; end: number; text: string };

// Terms come from evidenceInput. Offsets are half-open ORIGINAL code-point
// offsets. Normalization is used only for finding hits, never for quoted text.
export function selectEvidencePassages(text: string, terms: readonly string[]) {
  if (text.length > passageInputLimit * 2 || terms.length < 1 || terms.length > 8 || terms.some(term =>
    !term || term.length > 400 || normalizeArchiveText(term) !== term || /\s|[\p{Cc}\p{Cf}]/u.test(term))) throw new Error("Invalid passage input");
  const points = Array.from(text);
  if (points.length > passageInputLimit) throw new Error("Passage input too long");
  function result(ranges: { start: number; end: number }[]) {
    const segments: PassageSegment[] = ranges.map(({ start, end }) => ({ start, end, text: points.slice(start, end).join("") }));
    const included = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
    return { text: segments.map(segment => segment.text).join(passageGapMarker), segments,
      truncated: included < points.length, omittedCodePoints: points.length - included };
  }
  if (points.length <= evidenceTextLimit) return result([{ start: 0, end: points.length }]);
  const offsets: number[] = [], normalized: string[] = [];
  let offset = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    const part = normalizeArchiveText(segment); normalized.push(part);
    for (let index = 0; index < part.length; index++) offsets.push(offset);
    offset += Array.from(segment).length;
  }
  const searchable = normalized.join("");
  const firstHits = terms.map(term => searchable.indexOf(term)).filter(index => index >= 0).map(index => offsets[index]);
  if (!firstHits.length) return result([{ start: 0, end: evidenceTextLimit }]);
  const latest = Math.max(...terms.map(term => searchable.lastIndexOf(term)).filter(index => index >= 0).map(index => offsets[index]));
  const budget = evidenceTextLimit - Array.from(passageGapMarker).length;
  const firstLength = Math.ceil(budget / 2), secondLength = Math.floor(budget / 2);
  const firstStart = Math.min(Math.max(0, Math.min(...firstHits) - 160), points.length - firstLength);
  const firstEnd = firstStart + firstLength;
  // If every query hit is local, sample terminal context rather than pretending
  // that proximity alone locates the explanation. This is a measured heuristic.
  const secondStart = latest >= firstEnd
    ? Math.min(Math.max(0, latest - 160), points.length - secondLength)
    : points.length - secondLength;
  const secondEnd = secondStart + secondLength;
  if (secondStart <= firstEnd) {
    const start = Math.min(firstStart, points.length - evidenceTextLimit);
    return result([{ start, end: start + evidenceTextLimit }]);
  }
  return result([{ start: firstStart, end: firstEnd }, { start: secondStart, end: secondEnd }]);
}

// A trusted caller must already possess the permitted original passage text.
// This adapter changes presentation only; the original source references must
// still pass production whole-batch revalidation immediately before delivery.
export function withExperimentalPassage(evidence: Evidence, permittedText: string, terms: readonly string[]) {
  return { ...evidence, ...selectEvidencePassages(permittedText, terms) };
}
