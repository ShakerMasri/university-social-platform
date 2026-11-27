"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { feedText } from "@/i18n/feed";
import { PostCard } from "../communities/[id]/post-card";
import { onSessionChange } from "@/app/[locale]/session-change";
import { checkFeedSession } from "./check-session";
import { feedPageResponse, forYouPageResponse, type FeedPage } from "./data";

const feedLoadTimeout = 15_000;
const sessionRecheckInterval = 25_000;
const sessionFreshnessLimit = 30_000;
const sessionCheckTimeout = 5_000;
type FeedListProps = { locale: Locale; viewer: string; forYou?: boolean };
type FeedLoad = { controller: AbortController; timeout?: ReturnType<typeof setTimeout> };

export function FeedList(props: FeedListProps) {
  return <ViewerFeedList key={JSON.stringify([props.locale, props.viewer, Boolean(props.forYou)])} {...props} />;
}

function ViewerFeedList({ locale, viewer, forYou = false }: FeedListProps) {
  const text = feedText[locale];
  const path = forYou ? "feed/for-you" : "feed";
  const [page, setPage] = useState<FeedPage | null>(null);
  const [state, setState] = useState<"loading" | "done" | "failed" | "restart" | "unavailable" | "paused">("loading");
  const [message, setMessage] = useState(text.failed);
  const pending = useRef<FeedLoad | null>(null), last = useRef<string | undefined>(undefined);
  const checkingSession = useRef<AbortController | null>(null);
  const recheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const freshUntil = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), focusAfterLoad = useRef(false);
  const cards = useRef<HTMLUListElement>(null);
  const focusBeforeClear = useRef<Element | null>(null);

  const cancelRecheck = useCallback(() => {
    const check = checkingSession.current;
    checkingSession.current = null;
    freshUntil.current = null;
    clearTimeout(recheckTimer.current);
    recheckTimer.current = undefined;
    check?.abort();
  }, []);

  const cancelWork = useCallback(() => {
    const load = pending.current;
    pending.current = null;
    clearTimeout(load?.timeout);
    cancelRecheck();
    load?.controller.abort();
  }, [cancelRecheck]);

  const clear = useCallback((nextState: "paused" | "unavailable" | "failed") => {
    const focused = document.activeElement;
    if (nextState === "paused") focusBeforeClear.current = null;
    else if (cards.current?.contains(focused)) focusBeforeClear.current = focused;
    cancelWork();
    last.current = undefined;
    focusAfterLoad.current = false;
    setPage(null);
    if (nextState === "failed") setMessage(text.failed);
    setState(nextState);
  }, [cancelWork, text.failed]);

  const recheck = useCallback(async function recheck() {
    if (document.visibilityState !== "visible" || pending.current) return;
    const started = performance.now();
    const expiry = freshUntil.current;
    if (expiry !== null && started >= expiry) { clear("failed"); return; }
    if (checkingSession.current) return;

    const controller = new AbortController();
    checkingSession.current = controller;
    // A check triggered by focus still has to finish before the displayed cards expire.
    const deadline = Math.min(started + sessionCheckTimeout, expiry ?? Infinity);
    clearTimeout(recheckTimer.current);
    recheckTimer.current = setTimeout(() => {
      if (checkingSession.current === controller) clear("failed");
    }, deadline - started);

    const session = await checkFeedSession(viewer, controller.signal);
    if (checkingSession.current !== controller || document.visibilityState !== "visible") return;
    if (session === "changed") { clear("unavailable"); return; }
    if (session !== "verified" || performance.now() >= deadline) { clear("failed"); return; }

    checkingSession.current = null;
    clearTimeout(recheckTimer.current);
    recheckTimer.current = undefined;
    if (expiry !== null) {
      freshUntil.current = started + sessionFreshnessLimit;
      recheckTimer.current = setTimeout(recheck, started + sessionRecheckInterval - performance.now());
    }
  }, [clear, viewer]);

  const load = useCallback(async (after?: string, manual = true) => {
    if (pending.current || document.visibilityState !== "visible") return;
    focusBeforeClear.current = null;
    cancelRecheck();
    const controller = new AbortController();
    const operation: FeedLoad = { controller };
    pending.current = operation;
    last.current = after; focusAfterLoad.current = manual;
    // Replace each page instead of retaining old private cards while rechecking.
    setPage(null); setState("loading");
    const deadline = performance.now() + feedLoadTimeout;
    const fail = () => { setMessage(text.failed); setState("failed"); };
    operation.timeout = setTimeout(() => {
      if (pending.current !== operation) return;
      pending.current = null;
      controller.abort();
      fail();
    }, feedLoadTimeout);
    const current = () => pending.current === operation && document.visibilityState === "visible";
    const canContinue = () => {
      if (!current()) return false;
      if (performance.now() >= deadline) throw new Error("Feed request timed out");
      return true;
    };
    try {
      const query = after ? `?${new URLSearchParams({ after })}` : "";
      const response = await fetch(`/api/${path}${query}`, { cache: "no-store", signal: controller.signal });
      if (!canContinue()) return;
      if ([400, 404, 409].includes(response.status)) { last.current = undefined; setState("restart"); return; }
      if ([401, 403].includes(response.status)) { setState("unavailable"); return; }
      if (!response.ok) { setMessage(response.status === 429 ? text.rate : text.failed); setState("failed"); return; }
      const result = (forYou ? forYouPageResponse : feedPageResponse)(await response.json());
      if (!canContinue()) return;
      if (result.viewer !== viewer) { setState("unavailable"); return; }
      if (after && result.next === after) throw new Error("Feed cursor did not advance");
      // The feed response was authorized earlier. A fresh request uses the
      // browser's current cookie before any of that response is rendered.
      const verificationStarted = performance.now();
      const session = await checkFeedSession(viewer, controller.signal);
      if (!canContinue()) return;
      if (session === "changed") { setState("unavailable"); return; }
      if (session !== "verified") throw new Error("Feed session could not be verified");
      if (result.items.length) {
        freshUntil.current = verificationStarted + sessionFreshnessLimit;
        recheckTimer.current = setTimeout(recheck, verificationStarted + sessionRecheckInterval - performance.now());
      }
      setPage(result); setState("done");
    } catch { if (current()) fail(); }
    finally {
      if (pending.current === operation) {
        pending.current = null;
        clearTimeout(operation.timeout);
      }
    }
  }, [cancelRecheck, recheck, text, viewer, path, forYou]);
  useEffect(() => {
    const departure = () => clear("paused");
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { departure(); void recheck(); }
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") departure();
      else void recheck();
    };
    const stopListening = onSessionChange(() => clear("unavailable"));
    window.addEventListener("pagehide", departure);
    window.addEventListener("pageshow", restore);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", visibility);
    // Initial fetch is client-only: restored server payloads contain no feed text.
    const marker = { controller: new AbortController() };
    pending.current = marker;
    queueMicrotask(() => {
      if (pending.current !== marker) return;
      if (document.visibilityState !== "visible") departure();
      else { pending.current = null; void load(undefined, false); }
    });
    return () => {
      cancelWork();
      stopListening();
      window.removeEventListener("pagehide", departure);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancelWork, clear, load, recheck]);
  useLayoutEffect(() => {
    const previous = focusBeforeClear.current;
    focusBeforeClear.current = null;
    // Recover only when removing the cards dropped focus and nothing else took it.
    if (previous && !previous.isConnected && document.activeElement === document.body &&
        document.visibilityState === "visible" && (state === "unavailable" || state === "failed")) {
      heading.current?.focus();
    }
  }, [page, state]);
  useEffect(() => {
    if (state !== "loading" && focusAfterLoad.current) { focusAfterLoad.current = false; heading.current?.focus(); }
  }, [page, state]);
  return <section aria-labelledby="feed-results" aria-busy={state === "loading"}>
    <h2 id="feed-results" tabIndex={-1} ref={heading}>{text.results}</h2>
    {state === "loading" && <p role="status">{text.loading}</p>}
    {state === "failed" && <><p role="alert">{message}</p><button onClick={() => void load(last.current)}>{text.retry}</button></>}
    {state === "restart" && <><p role="alert">{text.restart}</p><button onClick={() => void load()}>{text.refresh}</button></>}
    {state === "unavailable" && <><p role="alert">{text.unavailable}</p><a href={`/${locale}/${path}`}>{text.reopen}</a></>}
    {state === "paused" && <><p role="status">{text.paused}</p><button onClick={() => void load()}>{text.refresh}</button></>}
    {page && <>
      {page.coldStart && <p role="status">{text.coldStart}</p>}
      {page.items.length === 0 ? <p role="status">{forYou ? text.forYouEmpty : text.empty}</p> : <ul ref={cards} className="community-list">{page.items.map(post => <li key={post.id}>
        {post.reason && <p>{post.reason === "joined" ? text.joinedReason : text.publicReason}</p>}
        <p>{text.community}: <Link prefetch={false} href={`/${locale}/communities/${post.communityId}`}><bdi>{post.communityName}</bdi></Link></p>
        <PostCard locale={locale} post={post} />
      </li>)}</ul>}
      {page.next ? <button onClick={() => void load(page.next!)}>{text.next}</button> : page.items.length > 0 && <p role="status">{text.end}</p>}
      <p><button onClick={() => void load()}>{text.refresh}</button></p>
    </>}
    <p><Link prefetch={false} href={`/${locale}/communities`}>{text.discover}</Link></p>
    {forYou && <p><Link prefetch={false} href={`/${locale}/search?tab=posts`}>{text.archive}</Link></p>}
  </section>;
}
