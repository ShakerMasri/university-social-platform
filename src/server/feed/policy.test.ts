import { describe, expect, it } from "vitest";
import { feedCursor, feedInput, feedViewer, verifyFeedCursor } from "./policy";

const user = "11111111-2222-3333-4444-555555555555", other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const key = "a".repeat(64), time = new Date("2026-11-17T00:00:00Z");
describe("membership-scoped feed cursors", () => {
  it("accepts only one bounded after parameter", () => {
    expect(feedInput(new URLSearchParams())).toBeUndefined();
    const cursor = feedCursor(user, time, user, "joined", key);
    expect(feedInput(new URLSearchParams({ after: cursor }))).toBe(cursor);
    for (const input of ["after=", "after=bad", `after=${cursor}&after=${cursor}`, "community=public", "q=anything", `after=${"x".repeat(10000)}`]) {
      expect(() => feedInput(new URLSearchParams(input))).toThrow();
    }
  });
  it("binds cursors to feed, actor, membership incarnation, anchor time and signing key", () => {
    const cursor = feedCursor(user, time, user, "joined", key);
    expect(() => verifyFeedCursor(cursor, time, user, "joined", key)).not.toThrow();
    for (const [date, actor, scope, secret] of [
      [time, other, "joined", key], [time, user, "rejoined", key],
      [new Date(time.getTime() + 1), user, "joined", key], [time, user, "joined", "b".repeat(64)],
    ] as const) expect(() => verifyFeedCursor(cursor, date, actor, scope, secret)).toThrow();
    expect(() => verifyFeedCursor(`${other}${cursor.slice(36)}`, time, user, "joined", key)).toThrow();
  });
  it("uses a distinct opaque viewer key and refuses invalid signing material", () => {
    expect(feedViewer(user, key)).toMatch(/^[0-9a-f]{64}$/);
    expect(feedViewer(user, key)).not.toBe(feedViewer(other, key));
    expect(() => feedViewer(user, "bad")).toThrow();
  });
});
