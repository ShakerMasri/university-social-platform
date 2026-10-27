"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { paginationText } from "@/i18n/pagination";
import { useHydrated } from "@/app/use-hydrated";
import type { ContentPage } from "./content-data";

const pageRequestTimeout = 15_000;

// Each request stays cursor-bounded and server-authorized. A transport failure
// requires an explicit retry; observation never creates an automatic retry loop.
export function CursorList<T extends { id: string }>({ initial, endpoint, parsePage, locale, moreLabel, itemPrefix, children }: {
  initial: ContentPage<T>; endpoint: string; parsePage: (value: unknown) => ContentPage<T>;
  locale: Locale; moreLabel: string; itemPrefix: string; children: (items: T[]) => ReactNode;
}) {
  const router = useRouter(), hydrated = useHydrated(), text = paginationText[locale];
  const [source, setSource] = useState(initial), [page, setPage] = useState(initial);
  const [state, setState] = useState<"idle" | "loading" | "failed" | "unavailable" | "loaded">("idle");
  const pending = useRef<AbortController | null>(null), sentinel = useRef<HTMLDivElement>(null);
  // A server refresh replaces the authorized snapshot, including accumulated
  // pages. Reset during render so old content is never painted under new props.
  if (source !== initial) { setSource(initial); setPage(initial); setState("idle"); }
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [initial, endpoint]);

  const loadMore = useCallback(async (manual: boolean) => {
    if (pending.current || !page.next || state === "unavailable") return;
    const controller = new AbortController(); pending.current = controller; setState("loading");
    const timeout = setTimeout(() => controller.abort(), pageRequestTimeout);
    try {
      const response = await fetch(`${endpoint}?after=${page.next}`, { cache: "no-store", signal: controller.signal });
      if (pending.current !== controller) return;
      if ([401, 403, 404].includes(response.status)) {
        setPage({ items: [], next: null }); setState("unavailable"); router.refresh(); return;
      }
      if (!response.ok) throw new Error("Content page unavailable");
      const result = parsePage(await response.json());
      if (pending.current !== controller) return;
      if (result.next === page.next) throw new Error("Cursor did not advance");
      const known = new Set(page.items.map(item => item.id)), added = result.items.filter(item => !known.has(item.id));
      setPage({ items: [...page.items, ...added], next: result.next }); setState("loaded");
      if (manual && added[0]) requestAnimationFrame(() => document.getElementById(`${itemPrefix}-${added[0].id}`)?.focus());
    } catch {
      if (pending.current === controller) setState("failed");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }, [endpoint, itemPrefix, page, parsePage, router, state]);

  useEffect(() => {
    if (!page.next || state === "loading" || state === "failed" || state === "unavailable" || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(false); }, { rootMargin: "0px 0px 200px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page.next, state, loadMore]);

  if (state === "unavailable") return <p role="alert">{text.unavailable}</p>;
  return <>{children(page.items)}
    <div ref={sentinel} aria-busy={state === "loading"}>
      {state === "failed" && <p role="alert">{text.failed}</p>}
      {page.next && <button type="button" disabled={!hydrated || state === "loading"} onClick={() => void loadMore(true)}>
        {state === "loading" ? text.loading : state === "failed" ? text.retry : moreLabel}
      </button>}
      <p aria-live="polite">{state === "loading" ? text.loading : state === "loaded" ? page.next ? text.loaded : text.end : ""}</p>
    </div>
  </>;
}
