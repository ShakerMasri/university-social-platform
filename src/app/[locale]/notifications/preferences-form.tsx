"use client";
import { useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { notificationText } from "@/i18n/notifications";
import { useHydrated } from "@/app/use-hydrated";
import { notificationPreferences } from "@/server/notifications/policy";

export function NotificationPreferencesForm({ locale, initial }: { locale: Locale; initial: { announcements: boolean; replies: boolean } }) {
  const text = notificationText[locale], hydrated = useHydrated(), feedback = useRef<HTMLParagraphElement>(null), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const form = new FormData(event.currentTarget), data = notificationPreferences({ announcements: form.has("announcements"), replies: form.has("replies") });
    submitting.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Settings unavailable");
      setMessage(text.saved);
    } catch { setMessage(text.failed); }
    finally { submitting.current = false; setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section aria-labelledby="notification-settings"><h2 id="notification-settings">{text.settings}</h2>
    <form onSubmit={submit} aria-busy={busy}>
      <label><input type="checkbox" name="announcements" defaultChecked={initial.announcements} disabled={!hydrated || busy} /> {text.announcements}</label>
      <label><input type="checkbox" name="replies" defaultChecked={initial.replies} disabled={!hydrated || busy} /> {text.replies}</label>
      <button disabled={!hydrated || busy}>{busy ? text.saving : text.save}</button>
    </form><p ref={feedback} role="status" tabIndex={-1}>{message}</p>
  </section>;
}
