import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { validInput } from "../communities/http.ts";
import { prepareEvidenceQuestion } from "./query-preparation.ts";
import { retrieveEvidence } from "./service.ts";

// Explicit opt-in: raw retrieval and archive search keep their original contract.
// The raw service alone owns budgets, authorization, locks and evidence shaping.
export async function retrievePreparedQuestionEvidence(db: PrismaClient, token: unknown, parameters: URLSearchParams) {
  const prepared = validInput(() => prepareEvidenceQuestion(parameters));
  return retrieveEvidence(db, token, prepared);
}
