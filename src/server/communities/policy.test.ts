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
});
