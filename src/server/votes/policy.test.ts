import { describe, expect, it } from "vitest";
import { voteInput, voteSummary } from "./policy";

describe("vote boundary", () => {
  it("accepts only an explicit signed desired state without client authority", () => {
    for (const value of [-1, 0, 1]) expect(voteInput({ value })).toEqual({ value });
    for (const value of [{}, { active: true }, { value: true }, { value: "1" }, { value: 2 }, { value: 0.5 }, { value: NaN },
      { value: null }, { value: 1, userId: "forged" }, { value: 1, score: 99 }, { value: 0, postId: "other" }]) expect(() => voteInput(value)).toThrow();
  });
  it("rejects malformed confirmation data instead of claiming success", () => {
    expect(voteSummary({ score: -2, upvotes: 1, downvotes: 3, value: -1, canVote: true })).toEqual({ score: -2, upvotes: 1, downvotes: 3, value: -1, canVote: true });
    // A balanced score can still include the requester's upvote.
    expect(voteSummary({ score: 0, upvotes: 2, downvotes: 2, value: 1, canVote: true }).value).toBe(1);
    for (const value of [null, [], {}, { score: 1, value: 2, canVote: true }, { score: 1.5, value: 0, canVote: true },
      { score: Number.MAX_SAFE_INTEGER + 1, value: 0, canVote: true }, { score: 1, value: "1", canVote: true }, { score: 1, value: 1 }]) expect(() => voteSummary(value)).toThrow();
    const valid = { score: 0, upvotes: 2, downvotes: 2, value: 0, canVote: true };
    for (const fields of [{ upvotes: -1 }, { downvotes: -1 }, { upvotes: 1.5 }, { downvotes: "2" },
      { upvotes: Number.MAX_SAFE_INTEGER + 1 }, { downvotes: null }, { score: 1 }, { score: 1.5 },
      { score: Number.MAX_SAFE_INTEGER + 1 }, { value: 2 }, { value: "1" }, { canVote: "yes" }]) {
      expect(() => voteSummary({ ...valid, ...fields })).toThrow();
    }
  });
});
