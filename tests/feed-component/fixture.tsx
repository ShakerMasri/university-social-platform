import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { FeedList } from "../../src/app/[locale]/feed/list";
import { announceSessionChange } from "../../src/app/[locale]/session-change";

export type SessionOutcome = 200 | 401 | 403 | 429 | 503 | "malformed" | "offline" | "pending";

const cardId = "00000000-0000-4000-8000-000000000001";
const post = {
  id: cardId,
  communityId: "00000000-0000-4000-8000-000000000002",
  title: "Synthetic feed sentinel",
  authorName: null,
  communityName: "Synthetic community",
  type: "DISCUSSION",
  body: "Harmless test content.",
  createdAt: "2026-11-01T00:00:00Z",
  resourceUrl: null,
  vote: { score: 0, upvotes: 0, downvotes: 0, value: 0, canVote: false },
};
const cursor = cardId + "." + "c".repeat(64);
const locale = location.pathname.startsWith("/ar/") ? "ar" : "en";
let viewer = "a".repeat(64);
let forYou = location.pathname.endsWith("/for-you");
let outcome: SessionOutcome = 200;
let empty = location.search === "?empty";
let visibility: DocumentVisibilityState = "visible";
const requests: { path: string; cache?: RequestCache; viewer: string | null; signal?: AbortSignal | null }[] = [];
const pending = new Map<number, (response: Response) => void>();
const mountedAt = document.getElementById("fixture")!;
const root = createRoot(mountedAt);
const now = performance.now.bind(performance);
let elapsedOffset = 0;
Object.defineProperty(performance, "now", { value: () => now() + elapsedOffset });
Object.defineProperty(document, "visibilityState", { get: () => visibility });

let sentinelsAdded = 0;
let sentinelsRemoved = 0;
const selector = "#post-" + cardId;
const containsCard = (node: Node) =>
  node instanceof Element && (node.matches(selector) || node.querySelector(selector) !== null);
function countMutations(records: MutationRecord[]) {
  for (const record of records) {
    sentinelsAdded += [...record.addedNodes].filter(containsCard).length;
    sentinelsRemoved += [...record.removedNodes].filter(containsCard).length;
  }
}
const observer = new MutationObserver(countMutations);
observer.observe(mountedAt, { childList: true, subtree: true });

window.fetch = async (input, options) => {
  if (typeof input !== "string") throw new Error("Unexpected fixture request");
  const expected = new Headers(options?.headers).get("X-Feed-Expected-Viewer");
  requests.push({ path: input, cache: options?.cache, viewer: expected, signal: options?.signal });
  if (input === "/api/feed/session") {
    if (outcome === "offline") throw new TypeError("Synthetic network failure");
    if (outcome === "malformed") return new Response("{", { status: 200 });
    if (outcome === "pending") {
      // Model a response promise that can settle even after the client aborts.
      return new Promise(resolve => pending.set(requests.length - 1, resolve));
    }
    return Response.json({ ok: outcome === 200 }, { status: outcome });
  }
  if (/^\/api\/feed(?:\/for-you)?(?:\?|$)/.test(input)) {
    const items = empty ? [] : [forYou ? { ...post, reason: "joined" } : post];
    return Response.json({ ok: true, items, viewer, coldStart: false, next: input.includes("?") ? null : cursor });
  }
  throw new Error("Unexpected fixture request");
};

const lifecycle: string[] = [];
function LifecycleProbe() {
  useLayoutEffect(() => {
    lifecycle.push("mount");
    return () => { lifecycle.push("cleanup"); };
  }, []);
  return null;
}
function render() {
  root.render(<StrictMode><LifecycleProbe /><FeedList locale={locale} viewer={viewer} forYou={forYou} /></StrictMode>);
}

const fixture = {
  setOutcome(next: SessionOutcome) { outcome = next; },
  setEmpty(next: boolean) { empty = next; },
  delayCallbacksBy(ms: number) { elapsedOffset += ms; },
  release(index: number) {
    const deliver = pending.get(index);
    if (!deliver) throw new Error("Missing held response");
    pending.delete(index);
    deliver(Response.json({ ok: true }));
  },
  changeViewer() { viewer = "b".repeat(64); render(); },
  switchFeed() { forYou = !forYou; render(); },
  unmount() { root.unmount(); },
  broadcast: announceSessionChange,
  visibility(next: DocumentVisibilityState) {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  },
  inspect() {
    countMutations(observer.takeRecords());
    return {
      added: sentinelsAdded,
      removed: sentinelsRemoved,
      lifecycle,
      requests: requests.map(({ signal, ...request }) => ({ ...request, aborted: Boolean(signal?.aborted) })),
    };
  },
};

declare global {
  interface Window {
    feedFixture: typeof fixture;
  }
}
window.feedFixture = fixture;
render();
