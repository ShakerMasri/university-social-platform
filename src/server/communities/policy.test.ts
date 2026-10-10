import { describe, expect, it } from "vitest";
import { communityId, communityInput, membershipInput } from "./policy";
describe("community input boundaries", () => {
  it("accepts trimmed bilingual text and bounds code points rather than UTF-16 units", () => {
    expect(communityInput({ name: "  هندسة Computer 😀  ", description: "", visibility: "PRIVATE" }).name).toBe("هندسة Computer 😀");
    expect(communityInput({ name: "😀".repeat(80), description: "أ".repeat(1000), visibility: "PUBLIC" }).name).toHaveLength(160);
    for (const name of ["", " \t", "أ".repeat(81), "line\nbreak", "bad\u0000name"]) {
      expect(() => communityInput({ name, description: "", visibility: "PUBLIC" })).toThrow();
    }
    expect(() => communityInput({ name: "x", description: "x".repeat(1001), visibility: "PUBLIC" })).toThrow();
  });
  it("rejects injected authority, invalid states and cross-user self actions", () => {
    const id = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
    expect(communityId(id.toUpperCase())).toBe(id);
    expect(membershipInput({ action: "join" })).toEqual({ action: "join", userId: undefined });
    expect(membershipInput({ action: "approve", userId: id })).toEqual({ action: "approve", userId: id });
    for (const input of [{ action: "join", userId: id }, { action: "leave", userId: id }, { action: "approve" }, { action: "ban", userId: id }, { action: "join", role: "OWNER" }]) expect(() => membershipInput(input)).toThrow();
    for (const input of [{ name: "x", description: "", visibility: "SECRET" }, { name: "x", description: "", visibility: "PUBLIC", ownerId: id }]) expect(() => communityInput(input)).toThrow();
    for (const value of [undefined, "", "../private", "' OR true", []]) expect(() => communityId(value)).toThrow();
  });
  it("requires an exact string action before applying its target rules", () => {
    const id = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
    for (const action of [["remove"], ["approve"], ["join"], ["leave"], [], {}, null, undefined, 1, true, new String("remove"), { toString: () => "remove" }, "REMOVE", " remove"]) {
      for (const target of [{}, { userId: id }]) expect(() => membershipInput({ action, ...target })).toThrow("Invalid membership input");
    }
    for (const action of ["join", "leave"]) {
      expect(membershipInput({ action })).toEqual({ action, userId: undefined });
      for (const userId of [id, undefined, null]) expect(() => membershipInput({ action, userId })).toThrow("Self membership only");
    }
    for (const action of ["approve", "remove"]) {
      expect(membershipInput({ action, userId: id.toUpperCase() })).toEqual({ action, userId: id });
      for (const userId of [undefined, null, [id], "bad"]) expect(() => membershipInput({ action, userId })).toThrow("Invalid identifier");
    }
  });
});
