"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { homeText } from "@/i18n/home";
import { shellText } from "@/i18n/shell";
import type { NotificationItem } from "@/app/[locale]/(app)/notifications/content-data";
import { onSessionChange } from "@/app/[locale]/session-change";
import { fetchNotificationPage, NotificationRequestError, notificationPreviewSize, openNotification } from "@/app/[locale]/shell/notification-requests";
import { NotificationSummaryList } from "@/app/[locale]/shell/notification-summary-list";
import { announceNotificationRead, announceUnreadCount } from "@/app/[locale]/shell/shell-events";
import { Card, CardHeader } from "@/ui/components/card";
import { Button } from "@/ui/components/button";
import styles from "./home.module.css";

// The side panel's notifications card, loaded only once the panel shows.
/** Coming back to the page reloads the card when it is older than this. */
const staleAfterMs = 25_000;

type PanelState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "session" }
  | { status: "ready"; items: NotificationItem[] };

export default function RecentNotifications({ locale }: { locale: Locale }) {
  const text = shellText[locale], home = homeText[locale], router = useRouter();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [openFailed, setOpenFailed] = useState(false);
  const pending = useRef<AbortController | null>(null), loadedAt = useRef(0);

  // Fetches and stores the result; state changes only after the request.
  const fetchInto = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    try {
      const page = await fetchNotificationPage(controller.signal);
      if (pending.current !== controller) return;
      loadedAt.current = performance.now();
      announceUnreadCount(page.unread);
      setState({ status: "ready", items: page.items.slice(0, notificationPreviewSize) });
    } catch (error) {
      if (pending.current !== controller) return;
      const status = error instanceof NotificationRequestError ? error.status : null;
      setState({ status: status === 401 || status === 403 ? "session" : "failed" });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);
  const load = useCallback(() => {
    setState({ status: "loading" }); setOpenFailed(false);
    return fetchInto();
  }, [fetchInto]);

  useEffect(() => {
    // Titles can come from private communities: drop them when the page is
    // left or the session changes, and recheck them when the reader returns.
    const clear = () => { pending.current?.abort(); pending.current = null; loadedAt.current = 0; setState({ status: "loading" }); };
    const returned = () => {
      if (document.visibilityState === "visible" && performance.now() - loadedAt.current > staleAfterMs) void load();
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    const stopSession = onSessionChange(() => { clear(); setState({ status: "session" }); });
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restored);
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    // The panel mounts in its loading state; start the first request after
    // this effect, as the feed list does.
    let active = true;
    queueMicrotask(() => { if (active) void fetchInto(); });
    return () => {
      active = false;
      pending.current?.abort(); pending.current = null;
      stopSession();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [fetchInto, load]);

  async function open(id: string) {
    setOpenFailed(false);
    try {
      const target = await openNotification(id);
      if (target.markedRead) announceNotificationRead();
      router.push(`/${locale}/communities/${target.communityId}/posts/${target.postId}?notification=${id}`);
    } catch {
      setOpenFailed(true);
    }
  }

  return (
    <Card as="section" aria-labelledby="home-notifications-heading">
      <CardHeader id="home-notifications-heading" title={text.notificationsPreview} />
      <div aria-live="polite" aria-busy={state.status === "loading"}>
        {state.status === "loading" && <p className={styles.panelNote}>{text.notificationsLoading}</p>}
        {state.status === "ready" && state.items.length === 0 && <p className={styles.panelNote}>{text.notificationsEmpty}</p>}
      </div>
      {state.status === "failed" && (
        <div role="alert" className={styles.panelError}>
          <p>{text.notificationsFailed}</p>
          <Button variant="secondary" size="compact" onClick={() => void load()}>{home.retry}</Button>
        </div>
      )}
      {state.status === "session" && (
        <div role="alert" className={styles.panelError}>
          <p>{home.sessionChanged}</p>
          <a href={`/${locale}`}>{home.reload}</a>
        </div>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <NotificationSummaryList locale={locale} items={state.items} onOpen={(id) => void open(id)} />
      )}
      {openFailed && <p role="alert" className={styles.panelError}>{text.notificationsOpenFailed}</p>}
      <p className={styles.panelFooter}>
        <Link prefetch={false} href={`/${locale}/notifications`}>{text.notificationsSeeAll}</Link>
      </p>
    </Card>
  );
}
