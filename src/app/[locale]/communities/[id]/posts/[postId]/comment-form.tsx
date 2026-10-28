"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { replyText } from "@/i18n/replies";
import type { Locale } from "@/i18n/locales";
import { commentText } from "@/i18n/comments";
import { commentInput } from "@/server/comments/policy";
import { useHydrated } from "@/app/use-hydrated";
import { commentResponse, type CommentItem } from "../../../content-data";

export function CommentForm({ locale, communityId, postId, onPublished, replyToId }: { locale: Locale; communityId: string; postId: string; onPublished: (comment: CommentItem) => void; replyToId?: string }) {
  const hydrated = useHydrated(), text = commentText[locale], formId = useId();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null), requestId = useRef<string | null>(null), submitting = useRef(false);
  function notify(value: string) {
    setMessage(value);
    requestAnimationFrame(() => { feedback.current?.focus({ preventScroll: true }); feedback.current?.scrollIntoView({ block: "center" }); });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    requestId.current ??= crypto.randomUUID();
    const input = { requestId: requestId.current, body: new FormData(form).get("body"), ...(replyToId ? { replyToId } : {}) };
    try { commentInput(input); } catch { notify(text.invalid); return; }
    submitting.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/communities/${communityId}/posts/${postId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
      if (!response.ok) {
        if (response.status === 409) requestId.current = null;
        notify(response.status === 429 ? text.rate : response.status === 409 ? text.conflict : text.failed);
        return;
      }
      const comment = commentResponse(await response.json());
      onPublished(comment);
      form.reset(); requestId.current = null; notify(text.saved);
    } catch { notify(text.failed); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <><p id={`${formId}-limits`}>{text.limits}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor={`${formId}-body`}>{replyToId ? replyText[locale].body : text.body}</label>
      <textarea id={`${formId}-body`} name="body" rows={4} required dir="auto" disabled={busy || !hydrated} aria-describedby={`${formId}-limits`} />
      <button type="submit" disabled={busy || !hydrated}>{busy ? text.busy : replyToId ? replyText[locale].publish : text.publish}</button>
    </form><p ref={feedback} role="status" tabIndex={-1}>{message}</p></>;
}
