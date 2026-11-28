import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceDisplayName, announceNotificationRead, announceNotificationsCleared, announceUnreadCount, onDisplayName, onNotificationRead, onNotificationsCleared, onUnreadCount } from "./shell-events";

beforeEach(() => { vi.stubGlobal("window", new EventTarget()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("page-to-header signals", () => {
  it("tells the header that a notification was read, until it stops listening", () => {
    const listener = vi.fn(), stop = onNotificationRead(listener);
    announceNotificationRead(); expect(listener).toHaveBeenCalledTimes(1);
    stop(); announceNotificationRead(); expect(listener).toHaveBeenCalledTimes(1);
  });
  it("tells the header that every notification was marked read, separately from single reads", () => {
    const cleared = vi.fn(), read = vi.fn(), stopCleared = onNotificationsCleared(cleared), stopRead = onNotificationRead(read);
    announceNotificationsCleared(); expect(cleared).toHaveBeenCalledTimes(1); expect(read).not.toHaveBeenCalled();
    stopCleared(); stopRead(); announceNotificationsCleared(); expect(cleared).toHaveBeenCalledTimes(1);
  });
  it("passes on a valid unread count and ignores malformed ones", () => {
    const listener = vi.fn(), stop = onUnreadCount(listener);
    announceUnreadCount(3); announceUnreadCount(0);
    for (const detail of [-1, 1.5, "2", null]) window.dispatchEvent(new CustomEvent("usp:unread-count", { detail }));
    expect(listener.mock.calls).toEqual([[3], [0]]);
    stop(); announceUnreadCount(4); expect(listener).toHaveBeenCalledTimes(2);
  });
  it("passes a saved display name and ignores malformed events", () => {
    const listener = vi.fn(), stop = onDisplayName(listener);
    announceDisplayName("Synthetic أحمد");
    window.dispatchEvent(new CustomEvent("usp:display-name", { detail: { name: "not a string" } }));
    expect(listener).toHaveBeenCalledExactlyOnceWith("Synthetic أحمد");
    stop(); announceDisplayName("Later"); expect(listener).toHaveBeenCalledTimes(1);
  });
});
