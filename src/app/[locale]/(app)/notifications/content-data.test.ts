import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { notificationOpenResponse } from "./content-data";

describe("notification open response", () => {
  const id = randomUUID(), communityId = randomUUID(), postId = randomUUID();
  const valid = { ok: true, id, communityId, postId, commentId: null, rootId: null, markedRead: true };

  it("returns the destination and whether this request marked the item read", () => {
    expect(notificationOpenResponse(valid, id)).toEqual({ communityId, postId, markedRead: true });
    expect(notificationOpenResponse({ ...valid, markedRead: false }, id).markedRead).toBe(false);
  });

  it.each([
    ["not an object", null],
    ["not ok", { ...valid, ok: false }],
    ["another notification", { ...valid, id: randomUUID() }],
    ["missing markedRead", { ...valid, markedRead: undefined }],
    ["non-boolean markedRead", { ...valid, markedRead: "true" }],
    ["invalid community id", { ...valid, communityId: "../x" }],
    ["invalid post id", { ...valid, postId: 7 }],
  ])("rejects %s", (_label, value) => {
    expect(() => notificationOpenResponse(value, id)).toThrow();
  });
});
