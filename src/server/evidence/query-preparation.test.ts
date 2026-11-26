import { describe, expect, it } from "vitest";
import { prepareEvidenceQuery } from "../../../tools/database/evidence-query-experiment";
import { prepareEvidenceQuestion } from "./query-preparation";
import { evaluationQueries } from "../../../tests/evaluation/evidence-corpus";
import { holdoutQueries } from "../../../tests/evaluation/evidence-query-holdout";

const prepare = (q: string) => prepareEvidenceQuestion(new URLSearchParams({ q })).get("q");
describe("server-only approved question preparation", () => {
  it.each([
    ["ما معنى التشفير؟", "التشفير"], ["ما معنى زمن الاستجابة؟", "زمن الاستجابة"], ["ما معنى NOT_SUPPORTED؟", "NOT_SUPPORTED"],
    ["What is CE202_v3 Node.js C++?", "CE202_v3 Node.js C++"],
  ])("preserves content identifiers: %s", (query, expected) => { expect(prepare(query)).toBe(expected); });
  it.each(["Why is TLS not obsolete?", "لماذا لا يحذف SELECT البيانات؟", "ما معنى لا؟", "ما معنى من؟", "ما معنى في؟", "What is CAN??", "Why is TLS never obsolete?", "What is not, safe?", "Why is TLS isn't obsolete?", "ما معنى غير آمن؟"])("keeps negation or ambiguity context: %s", query => {
    expect(prepare(query)).toBe(query);
  });
  it("keeps scope filters and the caller's input immutable", () => {
    const original = new URLSearchParams({ q: "ما معنى CE202؟", community: "00000000-0000-4000-b000-000000000001", type: "RESOURCE" });
    const prepared = prepareEvidenceQuestion(original);
    expect(prepared.get("q")).toBe("CE202"); expect(original.get("q")).toBe("ما معنى CE202؟");
    expect(prepared.get("community")).toBe(original.get("community")); expect(prepared.get("type")).toBe("RESOURCE");
  });
  it.each(["ما معنى واحد اثنان ثلاثة أربعة خمسة ستة سبعة؟", `ما معنى ${"x".repeat(200)}؟`, "ما معنى CE202؟\n"])("enforces the ORIGINAL limits: %s", query => {
    expect(() => prepare(query)).toThrow();
  });
  it("does not change prepared outputs for the frozen M5-02 queries", () => {
    const outcome = (prepareQuery: typeof prepareEvidenceQuery, query: string) => {
      try { return prepareQuery(new URLSearchParams({ q: query })).toString(); } catch { return "rejected"; }
    };
    for (const query of evaluationQueries) expect(outcome(prepareEvidenceQuestion, query.query)).toBe(outcome(prepareEvidenceQuery, query.query));
  });
  it("preserves the evaluated transformations of all twelve holdout questions", () => {
    const expected = ["DNS records", "TCP acknowledgments work", "وظيفة DHCP", "التشفير", "زمن الاستجابة",
      "Why is TLS not obsolete?", "لماذا لا يحذف SELECT البيانات؟", "CE202_v3 Node.js C++", "NOT_SUPPORTED",
      "ما معنى لا؟", "What is CAN??", "ما معنى من؟"];
    expect(holdoutQueries.map(query => prepare(query.query))).toEqual(expected);
  });
});
