"use client";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { shellText, withUnreadCount } from "@/i18n/shell";
import { notificationText } from "@/i18n/notifications";
import { unreadCountLimit } from "@/server/notifications/policy";
import { onNotificationRead, onNotificationsCleared } from "./shell-events";
import { useHydrated } from "@/app/use-hydrated";
import { BellIcon } from "@/ui/icons";
import { IconButton } from "@/ui/components/button";
import styles from "./shell.module.css";

// The preview panel (fetching, validation, list) loads on first open, or
// when the button is hovered or focused, so pages carry only the button.
const loadPreview = () => import("./notifications-preview");
const NotificationsPreview = lazy(loadPreview);

/**
 * Header notifications button with an unread dot. It is a disclosure: the
 * preview panel follows it in the DOM, so Tab moves into the list. Escape,
 * an outside press, or focus leaving closes it.
 */
export function NotificationsButton({ locale, initialUnread }: { locale: Locale; initialUnread: number | null }) {
  const text = shellText[locale];
  const hydrated = useHydrated(), panelId = useId(), headingId = useId();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const rootRef = useRef<HTMLDivElement>(null);

  // The server count arrives on a full load and on router.refresh(), but a
  // refresh that returns the same number as the last render changes nothing
  // here, so it cannot undo a count the preview set. Client navigation keeps
  // the layout too. So pages say what they changed (shell-events): opening an
  // item lowers the count only when the server marked it read, and "Mark all
  // read" clears it.
  const [source, setSource] = useState(initialUnread);
  if (source !== initialUnread) { setSource(initialUnread); setUnread(initialUnread); }
  // Above the limit the count only means "more", so it stays "99+".
  const decrement = () => setUnread((count) => count && count <= unreadCountLimit ? count - 1 : count);
  useEffect(() => onNotificationRead(decrement), []);
  useEffect(() => onNotificationsCleared(() => setUnread(0)), []);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) rootRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const warm = () => { void loadPreview(); };
  const label = unread ? withUnreadCount(text.notificationsUnread, unread, locale) : notificationText[locale].title;
  return (
    <div
      ref={rootRef}
      className={styles.popoverRoot}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); close(true); } }}
      onBlur={(event) => { if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    >
      <span className={styles.badgeAnchor}>
        <IconButton
          label={label}
          icon={<BellIcon />}
          disabled={!hydrated}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onPointerEnter={warm}
          onFocus={warm}
          onClick={() => setOpen((value) => !value)}
        />
        {unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
      </span>
      {open && (
        <Suspense fallback={<p className={`${styles.popover} ${styles.popoverNote}`} role="status">{text.notificationsLoading}</p>}>
          <NotificationsPreview
            locale={locale} id={panelId} headingId={headingId}
            onUnread={setUnread}
            onOpened={decrement}
            onNavigate={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
