import { describe, expect, it } from "vitest";
import { archiveAnchor, archiveCursor, archiveInput, normalizeArchiveText } from "./policy";
const key = "a".repeat(64), user = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002";
const input = (q: string) => archiveInput(new URLSearchParams({ q }));
describe("archive query and cursor contracts", () => {
  it("normalizes common Arabic marks and Latin case while preserving hamza distinctions and literal punctuation", () => {
    expect(normalizeArchiveText("CE101 قَـوَاعِد أ إ آ ة ى C++ 50% a_b")).toBe("ce101 قواعد أ إ آ ة ى c++ 50% a_b");
    expect(input("  CE101   مؤشرات ").terms).toEqual(["ce101", "مؤشرات"]);
    expect(input("select' 50% a_b \\path").terms).toEqual(["select'", "50%", "a_b", "\\path"]);
  });
  it.each(["", " ", "a", "% _", "ـَ", "word\nword", "ab\u202ecd", "a ".repeat(9), "😀".repeat(201), "x".repeat(201)])("rejects invalid or unbounded input %j", q => {
    expect(() => input(q)).toThrow();
  });
  it("bounds code points and query/filter keys rather than silently broadening search", () => {
    expect(input("é".repeat(200)).query.length).toBe(200);
    for (const parameters of ["q=test&q=other", "q=test&foo=1", "q=test&type=ADMIN", "q=test&community=all", "q=test&after=bad", "q=test&type="]) expect(() => archiveInput(new URLSearchParams(parameters))).toThrow();
  });
  it("binds signed cursors to the authenticated viewer, normalized query, filters and key", () => {
    const first = input("Study نص"), after = archiveCursor(id, first, user, key);
    expect(archiveAnchor({ ...first, after }, user, key)).toBe(id);
    expect(archiveAnchor({ ...input("study نص"), after }, user, key)).toBe(id);
    for (const changed of [input("different"), { ...first, communityId: id }, { ...first, type: "QUESTION" as const }]) expect(() => archiveAnchor({ ...changed, after }, user, key)).toThrow();
    expect(() => archiveAnchor({ ...first, after }, id, key)).toThrow();
    expect(() => archiveAnchor({ ...first, after }, user, "b".repeat(64))).toThrow();
    expect(() => archiveAnchor({ ...first, after: `${id}.${"0".repeat(64)}` }, user, key)).toThrow();
  });
});
