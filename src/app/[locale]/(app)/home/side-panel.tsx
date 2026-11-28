"use client";
import { lazy, Suspense, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/locales";
import { homeText } from "@/i18n/home";
import { shellText } from "@/i18n/shell";
import { Card } from "@/ui/components/card";
import styles from "./home.module.css";

// Its cards load only when the panel first shows.
const RecentNotifications = lazy(() => import("./recent-notifications"));

/** Keep in step with the side panel's media query in home.module.css. */
const wideQuery = "(min-width: 75rem)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const wideNow = () => window.matchMedia(wideQuery).matches;
const wideOnServer = () => false;

/**
 * Home's side panel: a stack of cards (recent notifications for now; more
 * cards can be added later). It renders, and loads, only while the window is
 * wide enough to show it; widening the window later loads it then.
 */
export function HomeSidePanel({ locale }: { locale: Locale }) {
  const wide = useSyncExternalStore(subscribeWide, wideNow, wideOnServer);
  if (!wide) return null;
  return (
    <aside className={styles.sidePanel} aria-label={homeText[locale].sidePanel}>
      <Suspense fallback={<Card><p className={styles.panelNote}>{shellText[locale].notificationsLoading}</p></Card>}>
        <RecentNotifications locale={locale} />
      </Suspense>
    </aside>
  );
}
