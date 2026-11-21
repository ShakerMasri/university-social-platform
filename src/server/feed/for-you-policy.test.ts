import { describe, expect, it } from "vitest";
import { compareForYou, forYouCursor, groupCutoff, membershipBoostMilliseconds, rankTime, verifyForYouCursor } from "./for-you-policy";
import { feedCursor, feedInput, verifyFeedCursor } from "./policy";

const user = "11111111-2222-3333-4444-555555555555", other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", key = "a".repeat(64);
const row = (id: string, time: string, currentMember: boolean) => ({ id, createdAt: new Date(time), currentMember });
// Frozen expected order established before running the ranking implementation.
const frozen = [
  row("00000000-0000-4000-8000-000000000001", "2026-03-28T12:00:00Z", true),
  row("00000000-0000-4000-8000-000000000002", "2026-03-31T12:00:00Z", false),
  row("00000000-0000-4000-8000-000000000003", "2026-03-31T12:00:00.001Z", false),
  row("00000000-0000-4000-8000-000000000004", "2026-03-27T12:00:00Z", true),
  row("00000000-0000-4000-8000-000000000005", "2026-03-29T12:00:00Z", false),
];
describe("For You membership/recency policy", () => {
  it("adds exactly 72 elapsed hours across daylight-saving dates, preserving publication time", () => {
    expect(membershipBoostMilliseconds).toBe(259200000);
    expect(rankTime(frozen[0])).toBe(Date.parse("2026-03-31T12:00:00Z"));
    expect(rankTime(frozen[1])).toBe(frozen[1].createdAt.getTime());
    expect(frozen[0].createdAt.toISOString()).toBe("2026-03-28T12:00:00.000Z");
  });
  it("merges joined/public content with global id ties and deterministic order", () => {
    const expected = [frozen[2], frozen[1], frozen[0], frozen[3], frozen[4]];
    expect([...frozen].sort(compareForYou)).toEqual(expected);
    expect([...frozen].reverse().sort(compareForYou)).toEqual(expected);
    expect(compareForYou(frozen[0], frozen[0])).toBe(0);
  });
  it("uses newest public posts for cold start and ignores all non-ranking signals", () => {
    const publicOnly = frozen.map(post => ({ ...post, currentMember: false }));
    expect(publicOnly.sort(compareForYou).map(post => post.id)).toEqual([frozen[2], frozen[1], frozen[4], frozen[0], frozen[3]].map(post => post.id));
    const decorated = frozen.map((post, index) => ({ ...post, votes: 1000 - index, comments: index * 1000,
      type: ["ANNOUNCEMENT", "QUESTION", "RESOURCE", "DISCUSSION"][index % 4], teacher: index === 4, authorId: user }));
    expect(decorated.sort(compareForYou).map(post => post.id)).toEqual([frozen[2], frozen[1], frozen[0], frozen[3], frozen[4]].map(post => post.id));
  });
  it("translates each global boundary correctly, including ties and millisecond edges", () => {
    for (const anchor of frozen) for (const candidate of frozen) {
      const cutoff = groupCutoff(anchor, candidate.currentMember);
      const after = candidate.createdAt < cutoff || +candidate.createdAt === +cutoff && candidate.id < anchor.id;
      expect(after).toBe(compareForYou(candidate, anchor) > 0);
    }
    const ordered = [...frozen].sort(compareForYou), pages = [];
    let anchor: typeof frozen[number] | undefined;
    do {
      const page = ordered.filter(post => !anchor || compareForYou(post, anchor) > 0).slice(0, 2);
      pages.push(...page); anchor = page.at(-1);
    } while (anchor);
    expect(pages).toEqual(ordered); expect(new Set(pages.map(post => post.id)).size).toBe(frozen.length);
  });
  it("strictly validates cursor shape and isolates feed/version, viewer, membership and anchor", () => {
    const anchor = { ...frozen[0], id: user }, cursor = forYouCursor(anchor, user, "scope", key);
    expect(feedInput(new URLSearchParams({ after: cursor }))).toBe(cursor);
    expect(() => verifyForYouCursor(cursor, anchor, user, "scope", key)).not.toThrow();
    for (const value of ["after=", "after=bad", `after=${cursor}&after=${cursor}`, "q=study", `after=${cursor}x`, `after=${"x".repeat(10000)}`]) expect(() => feedInput(new URLSearchParams(value))).toThrow();
    for (const [post, actor, scope, secret] of [
      [anchor, other, "scope", key], [anchor, user, "rejoined", key], [anchor, user, "scope", "b".repeat(64)],
      [{ ...anchor, currentMember: false }, user, "scope", key], [{ ...anchor, createdAt: new Date(+anchor.createdAt + 1) }, user, "scope", key],
      [{ ...anchor, id: other }, user, "scope", key],
    ] as const) expect(() => verifyForYouCursor(cursor, post, actor, scope, secret)).toThrow();
    expect(() => verifyForYouCursor(`${cursor.slice(0, -1)}${cursor.endsWith("0") ? "1" : "0"}`, anchor, user, "scope", key)).toThrow();
    expect(() => verifyForYouCursor(feedCursor(user, anchor.createdAt, user, "scope", key), anchor, user, "scope", key)).toThrow();
    expect(() => verifyFeedCursor(cursor, anchor.createdAt, user, "scope", key)).toThrow();
  });
});
