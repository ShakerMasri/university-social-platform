"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { messagingText } from "@/i18n/messaging";
import { conversationPage, type ConversationPage } from "./data";
import { MessageHTTPError, useMessageRequest } from "./use-request";
export function MessageInbox({ locale, scope }: { locale: Locale; scope: string }) {
  const text = messagingText[locale];
  const [data, setData] = useState<ConversationPage | null>(null), [feedback, setFeedback] = useState("");
  const [denied, setDenied] = useState(false), last = useRef<string | undefined>(undefined), result = useRef<HTMLDivElement>(null);
  function accept(value: unknown, after?: string) {
    const page = conversationPage(value);
    if (page.scope !== scope) { setDenied(true); throw new MessageHTTPError(403); }
    if (page.next && page.next === after) throw new Error("Cursor did not advance");
    setData(page);
  }
  function failed(error: unknown) {
    const code = error instanceof MessageHTTPError ? error.status : 0;
    if ([401, 403, 404].includes(code)) setDenied(true);
    setFeedback([401, 403, 404].includes(code) ? text.unavailable : code === 429 ? text.rate : text.failed);
  }
  const { busy, request } = useMessageRequest(() => { setData(null); setFeedback(text.expiredView); }, { url: "/api/conversations", apply: accept, failed });
  async function read(after?: string, focus = true) {
    last.current = after; setData(null); setFeedback("");
    await request(`/api/conversations${after ? `?after=${after}` : ""}`, {}, value => {
      accept(value, after);
    }, failed);
    if (focus) result.current?.focus();
  }
  return <>
    <p>{text.refreshHint}</p>
    <button disabled={busy || denied} onClick={() => void read()}>{text.refresh}</button>
    <div ref={result} tabIndex={-1} aria-busy={busy}>
      {busy && <p role="status">{text.loading}</p>}
      <p role="status">{feedback}</p>
      {feedback && !denied && <button disabled={busy} onClick={() => void read(last.current)}>{text.refresh}</button>}
      {data && <>
        {data.items.length === 0 && <p>{text.empty}</p>}
        <ul className="community-list">{data.items.map(item => <li className="community-card" key={item.id}>
          <h2><Link prefetch={false} href={`/${locale}/messages/${item.id}`}><bdi>{item.peer?.displayName ?? text.unknown}</bdi></Link></h2>
          <p>{item.state === "PENDING" ? item.initiatedByMe ? text.outgoing : text.incoming : item.state === "ACCEPTED" ? text.accepted : text.rejected}</p>
          {item.contactBlocked && <p>{text.blocked}</p>}
        </li>)}</ul>
        {data.next && <button disabled={busy} onClick={() => void read(data.next!)}>{text.next}</button>}
      </>}
    </div>
  </>;
}
