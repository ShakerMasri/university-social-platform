import { describe, expect, it } from "vitest";
import type { ArchiveSource } from "../../src/server/archive/service";
import { contextRelevance, rankContextEvidence } from "./evidence-ranking-revision";

function source(id: string, body: string, year = 2026): ArchiveSource {
  return { communityId: "space", postId: id, title: "Synthetic title", body,
    commentId: null, rootId: null, postCreatedAt: new Date(`${year}-01-01`), createdAt: new Date(`${year}-01-01`) };
}
describe("M5-04A2 bounded local-context ranking", () => {
  it("promotes older contextual text over bare repeated terms without penalizing distant length", () => {
    const answer = source("older", "PAT9 waits until all participating threads reach the synchronization barrier. " + "padding ".repeat(400), 2023);
    const question = source("recent", "PAT9?");
    expect(rankContextEvidence([question, answer], ["pat9"])[0].postId).toBe("older");
    expect(contextRelevance("PAT9 waits for another thread.", ["pat9"]))
      .toEqual(contextRelevance("PAT9 waits for another thread. " + " ".repeat(400) + "unrelated vocabulary", ["pat9"]));
  });
  it("retains literal technical punctuation and normalized Arabic", () => {
    expect(contextRelevance("C examples", ["c++"]).bodyTermCoverage).toBe(0);
    expect(contextRelevance("C++ pointer examples", ["c++"]).bodyTermCoverage).toBe(1);
    expect(contextRelevance("قَـواعِد مختبر تجريبي", ["قواعد"]).bodyTermCoverage).toBe(1);
  });
  it("prioritizes body term coverage and saturates repetition/diversity", () => {
    expect(contextRelevance("PAT9 ".repeat(100), ["pat9"]).localContext).toBe(0);
    expect(contextRelevance("PAT9 a b c d e f g h i j k l m n o", ["pat9"]).localContext).toBe(12);
    const partial = source("partial", "PAT9 alpha beta gamma delta epsilon zeta eta theta iota kappa lambda");
    const full = source("full", "PAT9 gate", 2023);
    expect(rankContextEvidence([partial, full], ["pat9", "gate"])[0].postId).toBe("full");
  });
  it("keeps deterministic ties and the five-source bound without mutating inputs", () => {
    const rows = Array.from({ length: 9 }, (_, i) => source(String(i), "PAT9 context"));
    expect(rankContextEvidence(rows, ["pat9"]).map(row => row.postId)).toEqual(["8", "7", "6", "5", "4"]);
    expect(rows[0].postId).toBe("0");
  });
  it("records the unresolved verbosity limitation rather than assigning semantic truth", () => {
    expect(contextRelevance("PAT9 alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu", ["pat9"]).localContext)
      .toBeGreaterThan(contextRelevance("PAT9 detects corruption.", ["pat9"]).localContext);
  });
});
