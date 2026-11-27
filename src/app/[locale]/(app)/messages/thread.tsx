"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { messagingText } from "@/i18n/messaging";
import { historyPage, record, type History } from "./data";
import { MessageHTTPError, useMessageRequest } from "./use-request";
import { MessageComposer } from "./composer";
import { prependOlderMessages } from "./history-window";
type ScrollPosition = { kind: "latest" } | { kind: "anchor"; id: string; offset: number; focus: boolean };
export function MessageThread({ locale, id, scope }: { locale: Locale; id: string; scope: string }) {
  const text = messagingText[locale], endpoint = `/api/conversations/${id}`;
  const [data, setData] = useState<History | null>(null), [feedback, setFeedback] = useState("");
  const [denied, setDenied] = useState(false), [compose, setCompose] = useState(false);
  const [recent, setRecent] = useState<{ id: string; body: string }[]>([]);
  const [olderFailed, setOlderFailed] = useState(false), [omittedNewer, setOmittedNewer] = useState(false);
  const result = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const olderButton = useRef<HTMLButtonElement>(null);
  const position = useRef<ScrollPosition | null>(null), previousTop = useRef(0), operation = useRef(false);
  function clearSnapshot() { setData(null); setRecent([]); setOlderFailed(false); setOmittedNewer(false); position.current = null; }
  function deny() { setDenied(true); clearSnapshot(); setCompose(false); setFeedback(text.unavailable); }
  function failed(error: unknown, older = false) {
    const code = error instanceof MessageHTTPError ? error.status : 0;
    if ([401, 403, 404].includes(code)) deny();
    else if (older) setOlderFailed(true);
    setFeedback([401, 403, 404].includes(code) ? text.unavailable : code === 429 ? text.rate : text.failed);
  }
  function parse(value: unknown) {
    const page = historyPage(value);
    if (page.scope !== scope) throw new MessageHTTPError(403);
    if (page.id !== id || (page.next && page.next !== page.items[0]?.id)) throw new Error("Invalid history page");
    return page;
  }
  function acceptLatest(value: unknown) {
    const page = parse(value);
    position.current = { kind: "latest" }; setData(page); setCompose(true);
  }
  const { busy, request } = useMessageRequest(() => { clearSnapshot(); setFeedback(text.expiredView); },
    { url: `${endpoint}/messages`, apply: acceptLatest, failed });
  // Restore the visible row before paint, including when a bounded older window
  // drops newer rows from its bottom. Height-difference anchoring cannot do that.
  useLayoutEffect(() => {
    const box = viewport.current, restore = position.current;
    if (!box || !restore) return;
    if (restore.kind === "latest") {
      box.scrollTop = box.scrollHeight;
      // The history viewport can itself be below the document fold. Opening a
      // chat must bring its latest row onto the screen, without moving focus.
      box.scrollIntoView({ block: "end" });
    }
    else {
      const anchor = box.querySelector<HTMLElement>(`[data-message-id="${restore.id}"]`);
      if (anchor) box.scrollTop += anchor.getBoundingClientRect().top - box.getBoundingClientRect().top - restore.offset;
      if (restore.focus) box.focus({ preventScroll: true });
    }
    previousTop.current = box.scrollTop; position.current = null;
  }, [data, recent]);
  async function read() {
    if (busy || operation.current || denied) return;
    operation.current = true; setFeedback(""); clearSnapshot();
    try { await request(`${endpoint}/messages`, {}, acceptLatest, failed); }
    finally { operation.current = false; result.current?.focus({ preventScroll: true }); }
  }
  async function loadOlder(focus: boolean) {
    if (busy || operation.current || denied || !data?.next || !viewport.current) return;
    const box = viewport.current, before = data.next;
    const anchor = [...box.querySelectorAll<HTMLElement>("[data-message-id]")].find(row => row.getBoundingClientRect().bottom > box.getBoundingClientRect().top);
    const restore: ScrollPosition | null = anchor ? { kind: "anchor", id: anchor.dataset.messageId!, offset: anchor.getBoundingClientRect().top - box.getBoundingClientRect().top, focus } : null;
    operation.current = true; setFeedback(""); setOlderFailed(false);
    try {
      await request(`${endpoint}/messages?before=${before}`, {}, value => {
        const page = parse(value);
        if (page.next === before) throw new Error("History cursor did not advance");
        const boundary = data.items[0];
        if (boundary && page.items.some(item => {
          const order = new Date(item.createdAt).getTime() - new Date(boundary.createdAt).getTime();
          return order > 0 || (order === 0 && item.id >= boundary.id);
        })) throw new Error("Invalid older history");
        const merged = prependOlderMessages(page.items, data.items);
        position.current = restore;
        setData({ ...page, items: merged.items }); setOmittedNewer(current => current || merged.omittedNewer);
        setFeedback(text.olderLoaded);
      }, error => failed(error, true));
    } finally { operation.current = false; }
  }
  async function act(kind: "request" | "block", body: { decision: "accept" | "reject" } | { blocked: boolean }) {
    if (busy || operation.current || denied) return;
    operation.current = true; setFeedback("");
    try { await request(`${endpoint}/${kind}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Messaging-Scope": scope }, body: JSON.stringify(body) }, value => {
      const row = record(value);
      if (kind === "request" && (row.id !== id || !["ACCEPTED", "REJECTED"].includes(String(row.state)))) throw new Error("Invalid decision acknowledgement");
      if (kind === "block" && (!("blocked" in body) || row.blockedByMe !== body.blocked)) throw new Error("Invalid block acknowledgement");
      // An acknowledgement is not a fresh permission snapshot. Require an
      // explicit read before showing updated send/decision capabilities.
      clearSnapshot(); setFeedback(text.savedAction);
    }, failed); }
    finally { operation.current = false; result.current?.focus({ preventScroll: true }); }
  }
  function saved(message: { id: string; body: string }) {
    position.current = { kind: "latest" };
    setRecent(items => [...items.filter(item => item.id !== message.id), message].slice(-20));
    setData(current => current && !current.items.some(item => item.id === message.id) ? { ...current, pendingRemaining: current.state === "PENDING" ? Math.max(0, current.pendingRemaining - 1) : 0,
      canSend: current.canSend && (current.state !== "PENDING" || current.pendingRemaining > 1) } : current);
  }
  return <>
    <p>{text.refreshHint}</p>
    <button disabled={busy || denied} onClick={() => void read()}>{text.refresh}</button>
    <div ref={result} tabIndex={-1} aria-busy={busy}>
      {busy && <p role="status">{text.loading}</p>}
      <p role="status">{feedback}</p>
      {!data && feedback && !denied && <button disabled={busy} onClick={() => void read()}>{text.refresh}</button>}
      {data && <>
        <h2 dir="auto"><bdi>{data.peer?.displayName ?? text.unknown}</bdi></h2>
        <p>{data.state === "PENDING" ? text.pending : data.state === "ACCEPTED" ? text.accepted : text.rejected}</p>
        {data.state === "PENDING" && data.initiatedByMe && <p>{text.remaining}: {data.pendingRemaining.toLocaleString(locale)}</p>}
        {data.contactBlocked && <p>{text.blocked}</p>}
        <div className="community-actions">
          {data.canAccept && <button disabled={busy} onClick={() => void act("request", { decision: "accept" })}>{text.accept}</button>}
          {data.canReject && <button disabled={busy} onClick={() => void act("request", { decision: "reject" })}>{text.reject}</button>}
          <button disabled={busy} onClick={() => void act("block", { blocked: !data.blockedByMe })}>{data.blockedByMe ? text.unblock : text.block}</button>
        </div>
        <p className="field-hint">{text.olderHint}</p>
        {omittedNewer && <p>{text.newerOutside} <button disabled={busy} onClick={() => void read()}>{text.latest}</button></p>}
        <div className="message-scroll" ref={viewport} role="region" aria-label={text.history} tabIndex={0} onScroll={() => {
          const box = viewport.current; if (!box) return;
          const upward = box.scrollTop < previousTop.current; previousTop.current = box.scrollTop;
          // Keyboard focus reveals the fallback without also activating it.
          if (upward && box.scrollTop <= 100 && !olderFailed && box.ownerDocument.activeElement !== olderButton.current) void loadOlder(false);
        }}>
        {data.next && <button ref={olderButton} disabled={busy} onClick={() => void loadOlder(true)}>{text.more}</button>}
        {data.items.length === 0 && <p>{text.emptyHistory}</p>}
        <ol className="community-list message-history">{data.items.map(item => <li className="community-card" key={item.id} data-message-id={item.id}>
          <p><strong>{item.mine ? text.me : data.peer?.displayName ?? text.peer}</strong> · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale, { timeZone: "UTC" })} UTC</time></p>
          <p className="community-description" dir="auto">{item.body}</p>
        </li>)}</ol>
        {recent.filter(item => !data.items.some(row => row.id === item.id)).map(item => <article className="community-card" key={item.id} data-message-id={item.id}>
          <p>{text.recent}</p><p className="community-description" dir="auto">{item.body}</p>
        </article>)}
        </div>
        {!data.canSend && <p>{text.waiting}</p>}
      </>}
    </div>
    {compose && !denied && <MessageComposer locale={locale} endpoint={`${endpoint}/messages`} conversationId={id} scope={scope}
      onSaved={saved} onDenied={deny} canSend={data?.canSend ?? false} disabled={busy || !data} />}
  </>;
}
