import { describe, expect, it } from "vitest";
import { feedPageResponse, forYouPageResponse } from "./data";
const post = { id: "11111111-2222-3333-4444-555555555555", communityId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  communityName: "CE101 مجتمع", type: "QUESTION", title: "سؤال", body: "Plain <script>text</script>", resourceUrl: null,
  createdAt: "2026-11-17T00:00:00Z", authorName: "دارس", vote: { score: 0, upvotes: 0, downvotes: 0, value: 0, canVote: true } };
const page = { ok: true, items: [post], next: null, viewer: "a".repeat(64) };
describe("feed response boundary", () => {
  it("requires an accurate reason and cold-start flag on every For You response", () => {
    const discovery = { ...page, coldStart: true, items: [{ ...post, reason: "public" }] };
    expect(forYouPageResponse(discovery)).toMatchObject({ coldStart: true, items: [{ reason: "public" }] });
    expect(forYouPageResponse({ ...discovery, coldStart: false, items: [{ ...post, reason: "joined" }] }).items[0].reason).toBe("joined");
    for (const value of [page, { ...discovery, coldStart: "true" }, { ...discovery, items: [post] },
      { ...discovery, items: [{ ...post, reason: "major" }] }, { ...discovery, items: [{ ...post, reason: "joined" }] }]) expect(() => forYouPageResponse(value)).toThrow();
  });
  it("retains original bilingual content and decodes dates for the existing PostCard", () => {
    const value = feedPageResponse(page);
    expect(value.items[0].createdAt).toBeInstanceOf(Date);
    expect(value.items[0]).toMatchObject({ communityName: post.communityName, body: post.body, title: post.title });
  });
  it("rejects malformed, duplicate or oversized pages rather than rendering partial content", () => {
    for (const value of [null, { ...page, viewer: "bad" }, { ...page, next: "bad" }, { ...page, items: [post, post] },
      { ...page, items: Array.from({ length: 21 }, () => post) }, { ...page, items: [{ ...post, communityName: undefined }] },
      { ...page, items: [{ ...post, createdAt: "bad" }] }]) expect(() => feedPageResponse(value)).toThrow();
  });
});
