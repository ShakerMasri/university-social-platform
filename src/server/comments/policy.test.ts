import { describe, expect, it } from "vitest";
import { commentInput } from "./policy";
const requestId = "11111111-2222-3333-4444-555555555555";
describe("comment input", () => {
  it("accepts only a valid direct reply target and forbids client-supplied thread roots", () => {
    expect(commentInput({ requestId, body: "Reply", replyToId: requestId }).replyToId).toBe(requestId);
    expect(commentInput({ requestId, body: "Comment" }).replyToId).toBeNull();
    for (const replyToId of [null, "bad", [], 1]) expect(() => commentInput({ requestId, body: "Reply", replyToId })).toThrow();
    expect(() => commentInput({ requestId, body: "Reply", rootId: requestId })).toThrow();
  });
  it("trims text and bounds Unicode code points rather than UTF-16 units", () => {
    expect(commentInput({ requestId, body: " \n عربي English 😀\t " }).body).toBe("عربي English 😀");
    expect(commentInput({ requestId, body: "😀".repeat(4000) }).body.length).toBe(8000);
    for (const body of ["", " \t\n", "😀".repeat(4001), "x\0y", "x\u0001y", "x\u007fy", 1, null]) expect(() => commentInput({ requestId, body })).toThrow();
    expect(commentInput({ requestId, body: "a\tب\r\nc" }).body).toBe("a\tب\r\nc");
  });
  it("rejects forged association/authority and invalid submission IDs", () => {
    for (const field of ["authorId", "postId", "communityId", "createdAt", "submissionKey", "role"]) expect(() => commentInput({ requestId, body: "x", [field]: requestId })).toThrow();
    for (const id of [undefined, null, [], "bad"]) expect(() => commentInput({ requestId: id, body: "x" })).toThrow();
  });
  it("retains markup as plain text", () => {
    const body = '<script>alert(1)</script>';
    expect(commentInput({ requestId, body }).body).toBe(body);
  });
  it("rejects unpaired UTF-16 surrogates rather than accepting text that cannot round-trip", () => {
    for (const body of ["\ud800", "\udfff", "before\ud800after", "\ud800\ud800", "\udfff\udfff", "\udfff\ud800"]) {
      expect(() => commentInput({ requestId, body })).toThrow();
    }
    expect(commentInput({ requestId, body: "\ud83d\ude00" }).body).toBe("😀");
  });
});
