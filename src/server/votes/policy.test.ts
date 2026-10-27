import { describe, expect, it } from "vitest";
import { voteInput, voteSummary } from "./policy";

describe("vote boundary", () => {
  it("accepts only an explicit boolean desired state without client authority", () => {
    expect(voteInput({ active: true })).toEqual({ active: true });
    expect(voteInput({ active: false })).toEqual({ active: false });
    for (const value of [{}, { active: 1 }, { active: "false" }, { active: null }, { active: true, userId: "forged" }, { active: true, count: 99 }, { active: false, postId: "other" }]) expect(() => voteInput(value)).toThrow();
  });
  it("rejects malformed confirmation data instead of claiming success", () => {
    expect(voteSummary({ count: 1, active: true, canVote: true })).toEqual({ count: 1, active: true, canVote: true });
    for (const value of [null, [], {}, { count: -1, active: false, canVote: true }, { count: 0, active: true, canVote: true },
      { count: 1.5, active: false, canVote: true }, { count: Number.MAX_SAFE_INTEGER + 1, active: false, canVote: true },
      { count: 1, active: "true", canVote: true }, { count: 1, active: true }]) expect(() => voteSummary(value)).toThrow();
  });
});
