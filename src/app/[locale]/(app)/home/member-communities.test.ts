import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { filterCommunities, memberCommunitiesResponse, sortCommunities, type MemberCommunity } from "./member-communities";

const row = (name: string, extra: Partial<MemberCommunity> = {}): MemberCommunity => ({ id: randomUUID(), name, visibility: "PUBLIC", isOwner: false, ...extra });

describe("the viewer's communities", () => {
  it("accepts the endpoint's shape and nothing else", () => {
    const items = [row("Circuits"), row("دوائر", { visibility: "PRIVATE", isOwner: true })];
    expect(memberCommunitiesResponse({ ok: true, items })).toEqual(items);
    for (const bad of [null, [], { ok: false, items }, { ok: true }, { ok: true, items: [{ ...items[0], isOwner: "yes" }] },
      { ok: true, items: [{ ...items[0], visibility: "SECRET" }] }, { ok: true, items: [{ ...items[0], name: "" }] },
      { ok: true, items: [{ ...items[0], id: "../x" }] }, { ok: true, items: [items[0], items[0]] },
      { ok: true, items: Array.from({ length: 501 }, () => row("x")) }]) {
      expect(() => memberCommunitiesResponse(bad)).toThrow();
    }
  });
  it("sorts names for the reader's language, numbers in order", () => {
    const names = (items: MemberCommunity[]) => items.map(item => item.name);
    expect(names(sortCommunities([row("Course 10"), row("course 2"), row("Algebra")], "en"))).toEqual(["Algebra", "course 2", "Course 10"]);
    expect(names(sortCommunities([row("هندسة"), row("برمجة"), row("أحياء")], "ar"))).toEqual(["أحياء", "برمجة", "هندسة"]);
  });
  it("filters by every typed word, ignoring case, tatweel and diacritics", () => {
    const items = [row("Computer Engineering"), row("هندســة الحاسوب"), row("Signals")];
    expect(filterCommunities(items, "  ").map(item => item.name)).toHaveLength(3);
    expect(filterCommunities(items, "ENGINEERING comp").map(item => item.name)).toEqual(["Computer Engineering"]);
    expect(filterCommunities(items, "هَندسة").map(item => item.name)).toEqual(["هندســة الحاسوب"]);
    expect(filterCommunities(items, "none")).toEqual([]);
  });
});
