import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { notificationText } from "@/i18n/notifications";
import type { NotificationItem } from "@/app/[locale]/(app)/notifications/content-data";
import styles from "./shell.module.css";

/**
 * Short notification lines (kind, title, time), each a button that opens it.
 * Used by the header preview and Home's side panel.
 */
export function NotificationSummaryList({ locale, items, onOpen }: { locale: Locale; items: readonly NotificationItem[]; onOpen: (id: string) => void }) {
  const text = shellText[locale], kinds = notificationText[locale];
  return (
    <ul className={styles.previewList}>
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className={styles.previewItem} onClick={() => onOpen(item.id)}>
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
  );
}
