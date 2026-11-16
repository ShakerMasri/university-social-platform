import { describe, expect, it } from "vitest";
import { lexicalDensity, rankEvidenceSources, rankingCandidateLimit } from "./evidence-ranking-experiment";
import type { ArchiveSource } from "../../src/server/archive/service";

function source(id: string, body: string, year = 2026): ArchiveSource {
  return { communityId: "space", postId: id, title: "Pipeline hazards", body,
    commentId: null, rootId: null, postCreatedAt: new Date(`${year}-01-01`), createdAt: new Date(`${year}-01-01`) };
}
describe("M5-04A evidence-only lexical ordering", () => {
  it("ranks the older concise explanation before five longer notices, then cuts to five", () => {
    const notices = Array.from({ length: 5 }, (_, i) => ({ ...source(String(i), "Social meetup agenda mentions pipeline hazards without explaining processor behavior."), title: `Pipeline hazards social notice ${i + 1}` }));
    const older = source("old", "Pipeline hazards pause instruction execution when operands or resources are unavailable.", 2024);
    expect(rankEvidenceSources([...notices, older], ["pipeline", "hazards"]).map(row => row.postId)).toEqual(["old", "4", "3", "2", "1"]);
    expect(notices).toHaveLength(5); expect(rankingCandidateLimit).toBe(21);
  });
  it("uses deterministic recency/ID ties without mutating the candidate order", () => {
    const rows = [source("a", "same", 2024), source("b", "same"), source("c", "same")];
    expect(rankEvidenceSources(rows, ["pipeline"]).map(row => row.postId)).toEqual(["c", "b", "a"]);
    expect(rows.map(row => row.postId)).toEqual(["a", "b", "c"]);
  });
  it("retains literal C++, normalized Arabic, and bounds term frequency", () => {
    expect(lexicalDensity("", "C only", ["c++"])).toBe(0);
    expect(lexicalDensity("", "C++", ["c++"])).toBeGreaterThan(0);
    expect(lexicalDensity("", "قَـواعِد", ["قواعد"])).toBeGreaterThan(0);
    expect(lexicalDensity("", "x ".repeat(100), ["x"])).toBeCloseTo(3 / Math.sqrt(201));
  });
  it("documents the lexical limitation: a short non-answer can outscore a long answer", () => {
    expect(lexicalDensity("", "pipeline hazards?", ["pipeline", "hazards"]))
      .toBeGreaterThan(lexicalDensity("", "Pipeline hazards pause instruction execution when operands or resources are unavailable.", ["pipeline", "hazards"]));
  });
});
