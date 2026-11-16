"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { feedText } from "@/i18n/feed";
import { PostCard } from "../communities/[id]/post-card";
import { feedPageResponse, type FeedPage } from "./data";

export function FeedList({ locale, viewer }: { locale: Locale; viewer: string }) {
  const text = feedText[locale];
  const [page, setPage] = useState<FeedPage | null>(null);
  const [state, setState] = useState<"loading" | "done" | "failed" | "restart" | "unavailable" | "paused">("loading");
  const [message, setMessage] = useState(text.failed);
  const pending = useRef<AbortController | null>(null), last = useRef<string | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null), focusAfterLoad = useRef(false);
  const load = useCallback(async (after?: string, manual = true) => {
    if (pending.current || document.visibilityState === "hidden") return;
    const controller = new AbortController(); pending.current = controller;
    last.current = after; focusAfterLoad.current = manual;
    // Replace each page instead of retaining old private cards while rechecking.
    setPage(null); setState("loading");
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const current = () => pending.current === controller && document.visibilityState !== "hidden";
    try {
      const query = after ? `?${new URLSearchParams({ after })}` : "";
      const response = await fetch(`/api/feed${query}`, { cache: "no-store", signal: controller.signal });
      if (!current()) return;
      if ([400, 404, 409].includes(response.status)) { last.current = undefined; setState("restart"); return; }
      if ([401, 403].includes(response.status)) { setState("unavailable"); return; }
      if (!response.ok) { setMessage(response.status === 429 ? text.rate : text.failed); setState("failed"); return; }
      const result = feedPageResponse(await response.json());
      if (!current()) return;
      if (result.viewer !== viewer) { setState("unavailable"); return; }
      if (after && result.next === after) throw new Error("Feed cursor did not advance");
      setPage(result); setState("done");
    } catch { if (current()) { setMessage(text.failed); setState("failed"); } }
    finally { clearTimeout(timeout); if (pending.current === controller) pending.current = null; }
  }, [text, viewer]);
  useEffect(() => {
    const clear = () => {
      pending.current?.abort(); pending.current = null; last.current = undefined; focusAfterLoad.current = false;
      setPage(null); setState("paused");
    };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); };
    window.addEventListener("pagehide", clear); document.addEventListener("visibilitychange", visibility);
    // Initial fetch is client-only: restored server payloads contain no feed text.
    const marker = new AbortController(); pending.current = marker;
    queueMicrotask(() => {
      if (pending.current !== marker) return;
      if (document.visibilityState === "hidden") clear();
      else { pending.current = null; void load(undefined, false); }
    });
    return () => { pending.current?.abort(); pending.current = null; window.removeEventListener("pagehide", clear); document.removeEventListener("visibilitychange", visibility); };
  }, [load]);
  useEffect(() => {
    if (state !== "loading" && focusAfterLoad.current) { focusAfterLoad.current = false; heading.current?.focus(); }
  }, [page, state]);
  return <section aria-labelledby="feed-results" aria-busy={state === "loading"}>
    <h2 id="feed-results" tabIndex={-1} ref={heading}>{text.results}</h2>
    {state === "loading" && <p role="status">{text.loading}</p>}
    {state === "failed" && <><p role="alert">{message}</p><button onClick={() => void load(last.current)}>{text.retry}</button></>}
    {state === "restart" && <><p role="alert">{text.restart}</p><button onClick={() => void load()}>{text.refresh}</button></>}
    {state === "unavailable" && <><p role="alert">{text.unavailable}</p><a href={`/${locale}/feed`}>{text.reopen}</a></>}
    {state === "paused" && <><p role="status">{text.paused}</p><button onClick={() => void load()}>{text.refresh}</button></>}
    {page && <>
      {page.items.length === 0 ? <p role="status">{text.empty}</p> : <ul className="community-list">{page.items.map(post => <li key={post.id}>
        <p>{text.community}: <Link prefetch={false} href={`/${locale}/communities/${post.communityId}`}><bdi>{post.communityName}</bdi></Link></p>
        <PostCard locale={locale} post={post} />
      </li>)}</ul>}
      {page.next ? <button onClick={() => void load(page.next!)}>{text.next}</button> : page.items.length > 0 && <p role="status">{text.end}</p>}
      <p><button onClick={() => void load()}>{text.refresh}</button></p>
    </>}
    <p><Link prefetch={false} href={`/${locale}/communities`}>{text.discover}</Link></p>
  </section>;
}
