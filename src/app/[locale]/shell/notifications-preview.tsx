"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import type { NotificationItem } from "@/app/[locale]/(app)/notifications/content-data";
import { fetchNotificationPage, notificationPreviewSize, openNotification } from "./notification-requests";
import { NotificationSummaryList } from "./notification-summary-list";
import styles from "./shell.module.css";


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
  /** Opening an item marked it read (as the server reported). */
  onOpened: () => void;
  /** Close the preview before navigating. */
  onNavigate: () => void;
}) {
  const text = shellText[locale], router = useRouter();
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const page = await fetchNotificationPage(controller.signal);
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

  async function openItem(notificationId: string) {
    setOpenFailed(false);
    try {
      const target = await openNotification(notificationId);
      // The header persists across navigation. The server says whether this
      // request marked the item read; the preview's flag may be stale.
      if (target.markedRead) onOpened();
      onNavigate();
      router.push(`/${locale}/communities/${target.communityId}/posts/${target.postId}?notification=${notificationId}`);
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
        <NotificationSummaryList locale={locale} items={preview.items} onOpen={(itemId) => void openItem(itemId)} />
      )}
      {openFailed && <p className={styles.popoverError} role="alert">{text.notificationsOpenFailed}</p>}
      <p className={styles.popoverFooter}>
        <Link prefetch={false} href={`/${locale}/notifications`} onClick={onNavigate}>{text.notificationsSeeAll}</Link>
      </p>
    </section>
  );
}
