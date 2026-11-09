"use client";
import { useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { messagingText } from "@/i18n/messaging";
import { historyPage, record, type History } from "./data";
import { MessageHTTPError, useMessageRequest } from "./use-request";
import { MessageComposer } from "./composer";
export function MessageThread({ locale, id, scope }: { locale: Locale; id: string; scope: string }) {
  const text = messagingText[locale], endpoint = `/api/conversations/${id}`;
  const [data, setData] = useState<History | null>(null), [feedback, setFeedback] = useState("");
  const [denied, setDenied] = useState(false), [compose, setCompose] = useState(false);
  const [recent, setRecent] = useState<{ id: string; body: string }[]>([]);
  const last = useRef<string | undefined>(undefined), result = useRef<HTMLDivElement>(null);
  function deny() { setDenied(true); setData(null); setCompose(false); setRecent([]); setFeedback(text.unavailable); }
  function failed(error: unknown) {
    const code = error instanceof MessageHTTPError ? error.status : 0;
    if ([401, 403, 404].includes(code)) deny();
    setFeedback([401, 403, 404].includes(code) ? text.unavailable : code === 429 ? text.rate : text.failed);
  }
  function accept(value: unknown, after?: string) {
    const page = historyPage(value);
    if (page.scope !== scope) throw new MessageHTTPError(403);
    if (page.id !== id || (page.next && page.next === after)) throw new Error("Invalid history page");
    setData(page); setCompose(true);
  }
  const { busy, request } = useMessageRequest(() => { setData(null); setRecent([]); setFeedback(text.expiredView); },
    { url: `${endpoint}/messages`, apply: accept, failed });
  async function read(after?: string, focus = true) {
    last.current = after; setFeedback(""); setData(null); setRecent([]);
    await request(`${endpoint}/messages${after ? `?after=${after}` : ""}`, {}, value => {
      accept(value, after);
    }, failed);
    if (focus) result.current?.focus();
  }
  async function act(kind: "request" | "block", body: { decision: "accept" | "reject" } | { blocked: boolean }) {
    setFeedback("");
    await request(`${endpoint}/${kind}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Messaging-Scope": scope }, body: JSON.stringify(body) }, value => {
      const row = record(value);
      if (kind === "request" && (row.id !== id || !["ACCEPTED", "REJECTED"].includes(String(row.state)))) throw new Error("Invalid decision acknowledgement");
      if (kind === "block" && (!("blocked" in body) || row.blockedByMe !== body.blocked)) throw new Error("Invalid block acknowledgement");
      // An acknowledgement is not a fresh permission snapshot. Require an
      // explicit read before showing updated send/decision capabilities.
      setData(null); setFeedback(text.savedAction);
    }, failed);
    result.current?.focus();
  }
  function saved(message: { id: string; body: string }) {
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
      {!data && feedback && !denied && <button disabled={busy} onClick={() => void read(last.current)}>{text.refresh}</button>}
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
        {data.items.length === 0 && <p>{text.emptyHistory}</p>}
        <ol className="community-list message-history">{data.items.map(item => <li className="community-card" key={item.id}>
          <p><strong>{item.mine ? text.me : data.peer?.displayName ?? text.peer}</strong> · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale, { timeZone: "UTC" })} UTC</time></p>
          <p className="community-description" dir="auto">{item.body}</p>
        </li>)}</ol>
        {data.next && <button disabled={busy} onClick={() => void read(data.next!)}>{text.more}</button>}
        {!data.canSend && <p>{text.waiting}</p>}
      </>}
      {recent.filter(item => !data?.items.some(row => row.id === item.id)).map(item => <article className="community-card" key={item.id}>
        <p>{text.recent}</p><p className="community-description" dir="auto">{item.body}</p>
      </article>)}
    </div>
    {compose && !denied && <MessageComposer locale={locale} endpoint={`${endpoint}/messages`} conversationId={id} scope={scope}
      onSaved={saved} onDenied={deny} canSend={data?.canSend ?? false} disabled={busy || !data} />}
  </>;
}
