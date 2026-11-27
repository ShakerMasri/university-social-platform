"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { messagingText } from "@/i18n/messaging";
import { communityId } from "@/server/communities/policy";
import { messageInput } from "@/server/messaging/policy";
import { useHydrated } from "@/app/use-hydrated";
import { conversationPage, record } from "./data";
import { MessageHTTPError, useMessageRequest } from "./use-request";

export function MessageComposer({ locale, endpoint, conversationId, scope, onSaved, onDenied, canSend = true, disabled = false }: {
  locale: Locale; endpoint: string; conversationId?: string;
  onSaved?: (message: { id: string; body: string }) => void; onDenied?: () => void;
  canSend?: boolean; disabled?: boolean;
  scope: string;
}) {
  const text = messagingText[locale], hydrated = useHydrated(), router = useRouter();
  const [body, setBody] = useState(""), [feedback, setFeedback] = useState("");
  const [retry, setRetry] = useState<{ body: string; requestId: string } | null>(null);
  const [denied, setDenied] = useState(false), status = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const [paused, setPaused] = useState(false);
  const { busy, request } = useMessageRequest(() => { if (!conversationId) setPaused(true); setFeedback(retry ? text.uncertain : text.expiredView); });
  async function resume() {
    await request("/api/conversations", {}, value => {
      if (conversationPage(value).scope !== scope) throw new MessageHTTPError(403);
      setPaused(false); setFeedback(retry ? text.uncertain : "");
    }, error => {
      const code = error instanceof MessageHTTPError ? error.status : 0;
      if ([401, 403, 404].includes(code)) { setBody(""); setRetry(null); setDenied(true); setFeedback(text.unavailable); }
      else setFeedback(code === 429 ? text.rate : text.failed);
    });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || disabled || paused || denied || (!canSend && !retry)) return;
    submitting.current = true;
    let input: { body: string; requestId: string };
    try { input = retry ?? messageInput({ body, requestId: crypto.randomUUID() }); }
    catch { submitting.current = false; setFeedback(text.invalid); status.current?.focus(); return; }
    // Save the exact key/text before the network call; never replace an
    // ambiguous submission with a new key or silently resend it on state changes.
    setRetry(input); setFeedback("");
    await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Messaging-Scope": scope }, body: JSON.stringify(input) }, value => {
      const row = record(value), id = communityId(row.conversationId), messageId = communityId(row.messageId);
      if (conversationId && id !== conversationId) throw new Error("Invalid conversation acknowledgement");
      setRetry(null); setBody(""); setFeedback(text.saved);
      if (onSaved) onSaved({ id: messageId, body: input.body });
      else router.push(`/${locale}/messages/${id}`);
    }, error => {
      const code = error instanceof MessageHTTPError ? error.status : 0;
      if ([401, 403, 404].includes(code)) {
        setDenied(true); setBody(""); setRetry(null); setFeedback(text.unavailable); onDenied?.();
      } else if (code === 400) { setRetry(null); setFeedback(text.invalid); }
      else setFeedback(code === 409 ? text.conflict : code === 429 ? text.rate : text.uncertain);
    });
    submitting.current = false;
    status.current?.focus();
  }
  return <div className="form-panel message-composer" aria-busy={busy}>
    {!denied && !disabled && !paused && <form onSubmit={event => void send(event)}>
      <label htmlFor="message-body">{text.body}</label>
      <textarea id="message-body" dir="auto" rows={4} value={body} readOnly={busy || disabled || retry !== null} required maxLength={8000}
        onChange={event => setBody(event.target.value)} aria-describedby="message-hint" />
      <p id="message-hint" className="field-hint">{text.hint}</p>
      <button disabled={!hydrated || busy || disabled || (!canSend && !retry)} type="submit">{busy ? text.working : retry ? text.retrySend : text.send}</button>
    </form>}
    {paused && !denied && <button disabled={busy} onClick={() => void resume()}>{text.refresh}</button>}
    <p role="status" ref={status} tabIndex={-1}>{feedback}</p>
    <Link prefetch={false} href={`/${locale}/messages`}>{text.back}</Link>
  </div>;
}
