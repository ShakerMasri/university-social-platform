import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceDisplayName, announceNotificationRead, onDisplayName, onNotificationRead } from "./shell-events";

beforeEach(() => { vi.stubGlobal("window", new EventTarget()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("page-to-header signals", () => {
  it("tells the header that a notification was read, until it stops listening", () => {
    const listener = vi.fn(), stop = onNotificationRead(listener);
    announceNotificationRead(); expect(listener).toHaveBeenCalledTimes(1);
    stop(); announceNotificationRead(); expect(listener).toHaveBeenCalledTimes(1);
  });
  it("passes a saved display name and ignores malformed events", () => {
    const listener = vi.fn(), stop = onDisplayName(listener);
    announceDisplayName("Synthetic أحمد");
    window.dispatchEvent(new CustomEvent("usp:display-name", { detail: { name: "not a string" } }));
    expect(listener).toHaveBeenCalledExactlyOnceWith("Synthetic أحمد");
    stop(); announceDisplayName("Later"); expect(listener).toHaveBeenCalledTimes(1);
  });
});
