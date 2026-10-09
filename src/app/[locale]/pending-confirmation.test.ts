import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePendingConfirmation, clearPendingConfirmation, pendingConfirmationToken } from "./pending-confirmation";

afterEach(() => { clearPendingConfirmation(); vi.useRealTimers(); });

describe("document-memory confirmation handoff", () => {
  it("does not extend the ten-minute memory lifetime when a remounted locale reads it", () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const synthetic = "a".repeat(43);
    capturePendingConfirmation(synthetic);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(pendingConfirmationToken() === synthetic).toBe(true);
    vi.advanceTimersByTime(8 * 60 * 1000);
    expect(pendingConfirmationToken() === "").toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("replaces earlier links and forgets completed or malformed confirmation state", () => {
    vi.useFakeTimers();
    const replacement = "b".repeat(43);
    capturePendingConfirmation("a".repeat(43));
    capturePendingConfirmation(replacement);
    expect(pendingConfirmationToken() === replacement).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    clearPendingConfirmation();
    expect(pendingConfirmationToken() === "").toBe(true);
    capturePendingConfirmation(replacement);
    capturePendingConfirmation("malformed");
    expect(pendingConfirmationToken() === "").toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
