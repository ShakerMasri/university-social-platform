import "server-only";
import { normalizeArchiveText } from "../archive/policy.ts";
import { evidenceInput } from "./policy.ts";

const questionFrames = [
  ["how", "does"], ["how", "do"], ["how", "is"], ["how", "are"],
  ["what", "is"], ["what", "are"], ["why", "does"], ["why", "do"],
  ["why", "is"], ["why", "are"], ["where", "is"], ["where", "are"],
  ["when", "does"], ["can", "you", "explain"],
  ["ما", "هو"], ["ما", "هي"], ["كيف"], ["لماذا"], ["هل"],
];
const negations = new Set(["not", "no", "never", "without", "cannot", "can't", "لا", "لم", "لن", "ليس", "ليست", "لست", "غير"]);
const ambiguousSingleWords = new Set(["من", "في", "عن", "على", "إلى", "هو", "هي", "ما"]);

// Syntax only, shared with the historical unguarded evaluation comparator.
// Callers must validate input; this does not implement the approved safeguards.
export function questionFrameContent(query: string): string | null {
  if (!/[?؟？]$/u.test(query) || /[?؟？]{2}$/u.test(query)) return null;
  const words = query.slice(0, -1).split(" ");
  const frame = questionFrames.find(prefix => prefix.every((word, index) => normalizeArchiveText(words[index] ?? "") === word));
  return frame ? words.slice(frame.length).join(" ") : null;
}

// Evidence questions only. Validate ORIGINAL limits before any reduction; no
// stemming, translation, global stop-word removal or replacement of identifiers.
export function prepareEvidenceQuestion(parameters: URLSearchParams): URLSearchParams {
  const input = evidenceInput(parameters), original = new URLSearchParams(parameters);
  const queryWords = normalizeArchiveText(input.query.replace(/[?؟？]$/u, "")).split(" ");
  if (queryWords.some(token => {
    // Detection only. Keep full negated questions because substring retrieval
    // cannot establish logical negation (not/notification, لا/خلاف).
    const word = token.replace(/^[('"«“]+|[),;:'"»”]+$/gu, "");
    return negations.has(word) || /n['’]t$/u.test(word);
  })) return original;

  let content: string | null;
  if (/[?؟？]$/u.test(input.query) && !/[?؟？]{2}$/u.test(input.query) && queryWords[0] === "ما" && queryWords[1] === "معنى") {
    const words = input.query.slice(0, -1).split(" ");
    content = words.slice(2).join(" ");
    if (words.length === 3 && ambiguousSingleWords.has(normalizeArchiveText(content))) return original;
  } else content = questionFrameContent(input.query);
  // Uncertain syntax and empty/single-character reductions retain the original.
  if (content === null || Array.from(content).length < 2) return original;
  const prepared = new URLSearchParams(parameters); prepared.set("q", content);
  evidenceInput(prepared);
  return prepared;
}
