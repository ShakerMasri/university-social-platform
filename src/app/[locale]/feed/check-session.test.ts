import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFeedSession } from "./check-session";

const viewer = "a".repeat(64);
afterEach(() => vi.unstubAllGlobals());

describe("feed session confirmation", () => {
  it("requires an explicit success from a fresh request before allowing display", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const { signal } = new AbortController();
    await expect(checkFeedSession(viewer, signal)).resolves.toBe("verified");
    expect(fetch).toHaveBeenCalledWith("/api/feed/session", {
      headers: { "X-Feed-Expected-Viewer": viewer }, cache: "no-store", signal,
    });
  });

  it.each([401, 403])("treats %d as loss of the expected authenticated viewer", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false }, { status })));
    await expect(checkFeedSession(viewer, new AbortController().signal)).resolves.toBe("changed");
  });

  it("fails closed on malformed or ambiguous responses, transport failure and cancellation", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: "true" }))
      .mockResolvedValueOnce(new Response("unexpected"))
      .mockResolvedValueOnce(Response.json({ ok: true }, { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(checkFeedSession(viewer, controller.signal)).resolves.toBe("failed");
    }
    controller.abort();
    await expect(checkFeedSession(viewer, controller.signal)).resolves.toBe("failed");
  });
});
