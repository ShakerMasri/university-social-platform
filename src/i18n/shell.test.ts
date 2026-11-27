import { describe, expect, it } from "vitest";
import { shellText, withUnreadCount } from "./shell";
import { unreadCountLimit } from "../server/notifications/policy";

describe("header unread label", () => {
  it("shows the localized number up to the limit", () => {
    expect(withUnreadCount(shellText.en.notificationsUnread, 3, "en")).toBe("Notifications, 3 unread");
    expect(withUnreadCount(shellText.en.notificationsUnread, unreadCountLimit, "en")).toBe(`Notifications, ${unreadCountLimit} unread`);
    expect(withUnreadCount(shellText.ar.notificationsUnread, 3, "ar")).toBe(`الإشعارات، ${(3).toLocaleString("ar")} غير مقروءة`);
  });
  it("shows the limit with a plus above it, in both languages", () => {
    expect(withUnreadCount(shellText.en.notificationsUnread, unreadCountLimit + 1, "en")).toBe(`Notifications, ${unreadCountLimit}+ unread`);
    expect(withUnreadCount(shellText.ar.notificationsUnread, unreadCountLimit + 1, "ar")).toBe(`الإشعارات، ${unreadCountLimit.toLocaleString("ar")}+ غير مقروءة`);
  });
});
