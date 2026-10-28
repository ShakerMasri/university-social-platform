import { describe, expect, it } from "vitest";
import { notificationPreferences } from "./policy";
describe("notification preferences boundary", () => {
  it("requires explicit booleans and rejects recipient/authority injection", () => {
    expect(notificationPreferences({ announcements: false, replies: true })).toEqual({ announcements: false, replies: true });
    for (const input of [{}, { announcements: "false", replies: true }, { announcements: false, replies: 0 }, { announcements: true, replies: true, userId: "other" }]) expect(() => notificationPreferences(input)).toThrow();
  });
});
