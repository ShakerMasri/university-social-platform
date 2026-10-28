"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { notificationText } from "@/i18n/notifications";
import { communityId } from "@/server/communities/policy";
import { useHydrated } from "@/app/use-hydrated";
import { CursorList } from "../communities/cursor-list";
import { notificationPageResponse, type NotificationItem } from "./content-data";

export function NotificationsList({ locale, initial }: { locale: Locale; initial: { items: NotificationItem[]; next: string | null; unread: number; scope: string } }) {
  const text = notificationText[locale], hydrated = useHydrated(), router = useRouter(), feedback = useRef<HTMLParagraphElement>(null), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [unavailable, setUnavailable] = useState(false);
  const [unread, setUnread] = useState(initial.unread);
  const [source, setSource] = useState(initial);
  if (source !== initial) { setSource(initial); setUnread(initial.unread); setUnavailable(false); }
  const parsePage = useCallback((value: unknown) => {
    const page = notificationPageResponse(value);
    if (page.scope !== initial.scope) { setUnavailable(true); router.refresh(); throw new Error("Access changed"); }
    setUnread(page.unread); return page;
  }, [initial.scope, router]);
  async function act(id?: string) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(id ? `/api/notifications/${id}/open` : "/api/notifications/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if ([401, 403, 404].includes(response.status)) { setUnavailable(true); router.refresh(); }
      if (!response.ok) throw new Error("Notifications unavailable");
      if (id) {
        const row = await response.json() as Record<string, unknown>;
        if (row.ok !== true || communityId(row.id) !== id) throw new Error("Invalid destination");
        router.push(`/${locale}/communities/${communityId(row.communityId)}/posts/${communityId(row.postId)}?notification=${id}`);
      } else { setMessage(text.marked); router.refresh(); }
    } catch { setMessage(text.failed); }
    finally { submitting.current = false; setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <div aria-busy={busy}>
    {!unavailable && <><p>{text.unread}: {unread.toLocaleString(locale)}</p>
      <button type="button" disabled={!hydrated || busy || unread === 0} onClick={() => void act()}>{text.markAll}</button>
      <CursorList initial={initial} endpoint="/api/notifications" parsePage={parsePage} locale={locale} moreLabel={text.more} itemPrefix="notification">
        {items => <>{items.length === 0 && <p>{text.empty}</p>}<div className="community-list">{items.map(item => <article className="community-card" key={item.id} id={`notification-${item.id}`} tabIndex={-1}>
          <p>{item.read ? text.read : <strong>{text.unread}</strong>} · {item.kind === "ANNOUNCEMENT" ? text.announcement : text.comment}</p>
          <p dir="auto">{item.title}</p>
          <time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleDateString(locale, { timeZone: "UTC" })}</time>
          <p><button type="button" disabled={!hydrated || busy} onClick={() => void act(item.id)}>{text.open}</button></p>
        </article>)}</div></>}
      </CursorList></>}
    <p ref={feedback} role="status" tabIndex={-1}>{message}</p>
  </div>;
}
