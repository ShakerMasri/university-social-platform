import { evidenceInput } from "../../src/server/evidence/policy.ts";
import { questionFrameContent } from "../../src/server/evidence/query-preparation.ts";

// Historical M5-03 comparator, NOT the approved entry point. Syntax is shared
// with production so the language rules are maintained in one place.
export function prepareEvidenceQuery(parameters: URLSearchParams): URLSearchParams {
  const input = evidenceInput(parameters), prepared = new URLSearchParams(parameters);
  const content = questionFrameContent(input.query);
  if (content === null || Array.from(content).length < 2) return prepared;
  prepared.set("q", content);
  evidenceInput(prepared);
  return prepared;
}
