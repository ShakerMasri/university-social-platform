import { describe, expect, it } from "vitest";
import { postInput } from "./policy";
const requestId = "11111111-2222-3333-4444-555555555555";
const input = { requestId, type: "QUESTION", title: "  سؤال Question 😀  ", body: " Useful\nمحتوى " };
describe("post input and link boundaries", () => {
  it("normalizes bilingual plain text and counts Unicode code points", () => {
    expect(postInput(input)).toMatchObject({ title: "سؤال Question 😀", body: "Useful\nمحتوى", resourceUrl: null });
    expect(postInput({ ...input, title: "😀".repeat(160), body: "أ".repeat(10000) }).title).toHaveLength(320);
    for (const title of ["", " ", "x".repeat(161), "bad\nname", "bad\u0000name"]) expect(() => postInput({ ...input, title })).toThrow();
    for (const body of ["", " ", "x".repeat(10001), "bad\u0001text"]) expect(() => postInput({ ...input, body })).toThrow();
  });
  it("keeps HTML as data, not an HTML rendering contract", () => {
    expect(postInput({ ...input, body: "<script>alert(1)</script>" }).body).toBe("<script>alert(1)</script>");
  });
  it("rejects actor injection, invalid kinds and invalid retry IDs", () => {
    for (const extra of [{ authorId: requestId }, { ownerId: requestId }, { role: "admin" }, { communityId: requestId }, { submissionKey: "x" }]) expect(() => postInput({ ...input, ...extra })).toThrow();
    for (const type of ["ADMIN", [], {}, null]) expect(() => postInput({ ...input, type })).toThrow();
    expect(() => postInput({ ...input, requestId: "bad" })).toThrow();
  });
  it("allows optional normalized HTTP/HTTPS resource links only", () => {
    expect(postInput({ ...input, type: "RESOURCE", resourceUrl: " HTTPS://EXAMPLE.TEST/notes " }).resourceUrl).toBe("https://example.test/notes");
    expect(postInput({ ...input, type: "RESOURCE", resourceUrl: "" }).resourceUrl).toBeNull();
    for (const resourceUrl of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/x", "//example.test", "https://u:p@example.test", "https://exa\nmple.test", "https://example.test/" + "x".repeat(2048), 1]) expect(() => postInput({ ...input, type: "RESOURCE", resourceUrl })).toThrow();
    expect(() => postInput({ ...input, resourceUrl: "https://example.test" })).toThrow();
  });
});
