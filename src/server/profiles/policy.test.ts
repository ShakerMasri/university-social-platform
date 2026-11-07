import { describe, expect, it } from "vitest";
import { peopleAnchor, peopleCursor, peopleInput, directoryProfileInput, profileSuggestion } from "./policy";
import { keyedDigest } from "../identity/policy";
const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", other = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", key = "a".repeat(64);
describe("profile discovery boundaries", () => {
  it("normalizes bilingual literal names and rejects malformed/unbounded parameters", () => {
    expect(peopleInput(new URLSearchParams({ q: "  أَحْـمَد ALI  " }))).toEqual({ query: "أحمد ali" });
    expect(peopleInput(new URLSearchParams({ q: "C%_++" })).query).toBe("c%_++");
    expect(peopleInput(new URLSearchParams({ q: "😀😀" })).query).toBe("😀😀");
    expect(peopleInput(new URLSearchParams({ q: "  Ali   أحمد  " })).query).toBe("ali أحمد");
    // URLSearchParams replaces lone surrogates before this URL boundary.
    for (const query of ["", "a", "ــَ", " ", "x".repeat(61), "ab\n", "ab\u202e"]) expect(() => peopleInput(new URLSearchParams({ q: query }))).toThrow();
    for (const parameters of ["q=Ali&q=Bob", "q=Ali&email=x", "after=bad&q=Ali", "q=Ali&after="]) expect(() => peopleInput(new URLSearchParams(parameters))).toThrow();
  });
  it("binds cursors to actor/query and rejects altered or cross-scope values", () => {
    const input = peopleInput(new URLSearchParams({ q: "ALI" })), after = peopleCursor(id, input, id, key);
    expect(peopleAnchor({ ...input, after }, id, key)).toBe(id);
    for (const [query, actor, cursor] of [["bob", id, after], [input.query, other, after], [input.query, id, `${after.slice(0, -1)}z`]]) {
      expect(() => peopleAnchor({ query, after: cursor }, actor, key)).toThrow();
    }
  });
  it("uses the Unicode-consistent v3 matching contract and rejects v1/v2 cursors", () => {
    const input = peopleInput(new URLSearchParams({ q: "a²a" }));
    const after = peopleCursor(id, input, id, key);
    expect.soft(after).toBe(`${id}.${keyedDigest(key, JSON.stringify(["m4-people-v3", id, input.query, id]))}`);
    expect(peopleAnchor({ ...input, after }, id, key)).toBe(id);
    for (const version of ["m4-people-v1", "m4-people-v2"]) {
      const old = `${id}.${keyedDigest(key, JSON.stringify([version, id, input.query, id]))}`;
      expect.soft(() => peopleAnchor({ ...input, after: old }, id, key)).toThrow();
    }
    expect(() => peopleAnchor({ ...input, after }, other, key)).toThrow();
    expect(() => peopleAnchor({ query: "a³a", after }, id, key)).toThrow();
  });
  it("requires explicit boolean visibility and a valid display name, never ownership fields", () => {
    expect(directoryProfileInput({ displayName: " عضو علي 😀 ", directoryVisible: true })).toEqual({ displayName: "عضو علي 😀", directoryVisible: true });
    for (const input of [{ displayName: "Ali" }, { displayName: "Ali", directoryVisible: "true" }, { displayName: "", directoryVisible: true },
      { displayName: "Ali", directoryVisible: false, userId: other }, { displayName: "Ali\n", directoryVisible: true, directoryId: id },
      { displayName: "A\u202eB", directoryVisible: true }, { displayName: "ab\ud800", directoryVisible: true }]) expect(() => directoryProfileInput(input)).toThrow();
    expect(profileSuggestion(id)).toMatch(/^[0-9A-F]{10}$/);
    expect(profileSuggestion(id)).toBe(profileSuggestion(id.toUpperCase()));
    expect(profileSuggestion(id)).not.toBe(profileSuggestion(other));
  });
});
