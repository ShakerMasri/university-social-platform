"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { notificationText } from "@/i18n/notifications";
import { communityId } from "@/server/communities/policy";
import { notificationPageResponse, type NotificationItem } from "@/app/[locale]/(app)/notifications/content-data";
import styles from "./shell.module.css";

/** How many notifications the header preview shows; the rest are on /notifications. */
export const notificationPreviewSize = 5;
const requestTimeoutMs = 15_000;

type PreviewState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; items: NotificationItem[] };

/**
 * The open header preview, loaded on first open so pages don't carry it.
 * It fetches the list on every mount (never cached); closing unmounts it and
 * aborts the request. Opening an item uses the same owner-checked endpoint
 * as the notifications page.
 */
export default function NotificationsPreview({ locale, id, headingId, onUnread, onOpened, onNavigate }: {
  locale: Locale; id: string; headingId: string;
  /** The current unread count from the server. */
  onUnread: (count: number) => void;
  /** An unread item was opened (and marked read). */
  onOpened: () => void;
  /** Close the preview before navigating. */
  onNavigate: () => void;
}) {
  const text = shellText[locale], kinds = notificationText[locale], router = useRouter();
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]) });
        if (!response.ok) throw new Error("Notifications unavailable");
        const page = notificationPageResponse(await response.json());
        if (controller.signal.aborted) return;
        onUnread(page.unread);
        setPreview({ status: "ready", items: page.items.slice(0, notificationPreviewSize) });
      } catch {
        if (!controller.signal.aborted) setPreview({ status: "failed" });
      }
    })();
    return () => controller.abort();
    // One request per opening: the preview mounts when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openItem({ id: notificationId, read }: NotificationItem) {
    setOpenFailed(false);
    try {
      const response = await fetch(`/api/notifications/${notificationId}/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
      if (!response.ok) throw new Error("Notification unavailable");
      const row = await response.json() as Record<string, unknown>;
      if (row.ok !== true || communityId(row.id) !== notificationId) throw new Error("Invalid destination");
      // The header persists across navigation; opening marked this one read.
      if (!read) onOpened();
      onNavigate();
      router.push(`/${locale}/communities/${communityId(row.communityId)}/posts/${communityId(row.postId)}?notification=${notificationId}`);
    } catch {
      setOpenFailed(true);
    }
  }

  return (
    <section id={id} className={styles.popover} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.popoverHeading}>{text.notificationsPreview}</h2>
      <div aria-live="polite" aria-busy={preview.status === "loading"}>
        {preview.status === "loading" && <p className={styles.popoverNote}>{text.notificationsLoading}</p>}
        {preview.status === "failed" && <p className={styles.popoverError} role="alert">{text.notificationsFailed}</p>}
        {preview.status === "ready" && preview.items.length === 0 && <p className={styles.popoverNote}>{text.notificationsEmpty}</p>}
      </div>
      {preview.status === "ready" && preview.items.length > 0 && (
        <ul className={styles.previewList}>
          {preview.items.map((item) => (
            <li key={item.id}>
              <button type="button" className={styles.previewItem} onClick={() => void openItem(item)}>
                <span className={styles.previewKind}>
                  {!item.read && <span className={styles.previewUnread} aria-hidden="true" />}
                  {item.kind === "ANNOUNCEMENT" ? kinds.announcement : item.kind === "COMMENT" ? kinds.comment : kinds.upvote}
                  {!item.read && <span className="ui-visually-hidden"> · {text.unreadMarker}</span>}
                </span>
                <bdi className={styles.previewTitle}>{item.title}</bdi>
                <time className={styles.previewTime} dateTime={item.createdAt.toISOString()}>
                  {item.createdAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openFailed && <p className={styles.popoverError} role="alert">{text.notificationsOpenFailed}</p>}
      <p className={styles.popoverFooter}>
        <Link prefetch={false} href={`/${locale}/notifications`} onClick={onNavigate}>{text.notificationsSeeAll}</Link>
      </p>
    </section>
  );
}
