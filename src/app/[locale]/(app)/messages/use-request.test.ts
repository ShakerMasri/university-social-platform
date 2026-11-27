import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node-level lifecycle harness; real React mounting and authenticated views are
// separately covered by the synthetic browser suite. Assert observable fetch,
// cancellation and publication behavior without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void))[], setBusy: vi.fn() }));
vi.mock("react", () => ({
  useCallback: <T,>(callback: T) => callback,
  useRef: <T,>(value: T) => ({ current: value }),
  useState: <T,>(value: T) => [value, hooks.setBusy],
  useEffect: (effect: () => (() => void)) => { hooks.effects.push(effect); },
}));
import { useMessageRequest } from "./use-request";

let documentState: EventTarget & { visibilityState: "hidden" | "visible" };
let cleanup: (() => void) | undefined;
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks(); hooks.effects = [];
  documentState = Object.assign(new EventTarget(), { visibilityState: "visible" as const });
  vi.stubGlobal("document", documentState); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response('{}', { headers: { "Content-Type": "application/json" } }));
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
function mount(initial = true) {
  const apply = vi.fn(), failed = vi.fn(), clear = vi.fn();
  const view = useMessageRequest(clear, initial ? { url: "/api/conversations", apply, failed } : undefined);
  cleanup = hooks.effects.at(-1)!();
  return { ...view, apply, failed, clear };
}
describe("messaging visibility before mounting and response delivery", () => {
  it.each([true, false])("pauses an initially hidden view (initial read: %s) until explicit visible rechecking", async initial => {
    documentState.visibilityState = "hidden";
    const view = mount(initial);
    await Promise.resolve();
    expect(view.clear).toHaveBeenCalledTimes(1); expect(hooks.setBusy).toHaveBeenLastCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled(); expect(view.apply).not.toHaveBeenCalled(); expect(view.failed).not.toHaveBeenCalled();
    documentState.visibilityState = "visible"; documentState.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).not.toHaveBeenCalled(); // Returning does not poll or silently resume.
    await view.request("/api/conversations", {}, view.apply, view.failed);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(view.apply).toHaveBeenCalledExactlyOnceWith({});
  });
  it("does not let an unmounted hidden view notify a replacement after its queued mount check", async () => {
    documentState.visibilityState = "hidden"; const view = mount(); cleanup!(); cleanup = undefined;
    await Promise.resolve();
    expect(view.clear).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a manual hidden request without spending a read or applying its response", async () => {
    const view = mount(false); documentState.visibilityState = "hidden";
    await view.request("/api/conversations", {}, view.apply, view.failed);
    expect(view.clear).toHaveBeenCalledTimes(1); expect(fetchMock).not.toHaveBeenCalled(); expect(view.apply).not.toHaveBeenCalled();
  });
  it("suppresses a parsed response if the page became hidden before a departure event was handled", async () => {
    const view = mount(false), body = Promise.withResolvers<unknown>();
    const response = new Response(); vi.spyOn(response, "json").mockReturnValue(body.promise); fetchMock.mockResolvedValue(response);
    const reading = view.request("/api/conversations", {}, view.apply, view.failed);
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    documentState.visibilityState = "hidden"; body.resolve({ private: "obsolete" }); await reading;
    expect(view.apply).not.toHaveBeenCalled(); expect(view.failed).not.toHaveBeenCalled(); expect(view.clear).toHaveBeenCalledTimes(1);
  });
});
