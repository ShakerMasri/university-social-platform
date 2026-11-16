"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class MessageHTTPError extends Error { constructor(public readonly status: number) { super("Messaging request failed"); } }
// Read afresh after each await; visibility is external mutable browser state.
const pageIsHidden = () => document.visibilityState === "hidden";
// A response remains obsolete after unmount, tab departure or a later request,
// including when its headers arrived before a delayed JSON body.
type InitialRead = { url: string; apply: (body: unknown) => void; failed: (error: unknown) => void };
export function useMessageRequest(onLeave: () => void, initial?: InitialRead) {
  const pending = useRef<AbortController | null>(null), leave = useRef(onLeave);
  leave.current = onLeave;
  const first = useRef(initial), [busy, setBusy] = useState(Boolean(initial));
  const clear = useCallback(() => { pending.current?.abort(); pending.current = null; setBusy(false); leave.current(); }, []);
  const perform = useCallback(async (controller: AbortController, url: string, options: RequestInit, apply: (body: unknown) => void, failed: (error: unknown) => void) => {
    const current = () => pending.current === controller;
    try {
      const response = await fetch(url, { ...options, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (!current()) return;
      if (pageIsHidden()) { clear(); return; }
      if (!response.ok) throw new MessageHTTPError(response.status);
      const body: unknown = await response.json();
      if (current()) {
        if (pageIsHidden()) clear();
        else apply(body);
      }
    } catch (error) {
      if (current()) {
        if (pageIsHidden()) clear();
        else failed(error);
      }
    }
    finally { if (current()) { pending.current = null; setBusy(false); } }
  }, [clear]);
  useEffect(() => {
    const visibility = () => { if (pageIsHidden()) clear(); };
    window.addEventListener("pagehide", clear); document.addEventListener("visibilitychange", visibility);
    if (pageIsHidden()) {
      // Departure may precede mounting, so no future event is guaranteed.
      // Notify the parent after effect setup, only for this mounted instance;
      // cleanup/Strict Mode replay must invalidate the queued notification.
      const controller = new AbortController(); pending.current = controller;
      queueMicrotask(() => { if (pending.current === controller) clear(); });
    } else if (first.current) {
      const controller = new AbortController(); pending.current = controller;
      void perform(controller, first.current.url, {}, first.current.apply, first.current.failed);
    }
    return () => { pending.current?.abort(); pending.current = null; window.removeEventListener("pagehide", clear); document.removeEventListener("visibilitychange", visibility); };
  }, [clear, perform]);
  const request = useCallback(async (url: string, options: RequestInit, apply: (body: unknown) => void, failed: (error: unknown) => void) => {
    if (pending.current) return;
    if (pageIsHidden()) { clear(); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    await perform(controller, url, options, apply, failed);
  }, [clear, perform]);
  return { busy, request };
}
