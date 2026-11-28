"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import styles from "./tabs.module.css";

type Report = (pending: boolean) => void;
const PendingReport = createContext<Report | null>(null);

/**
 * Wraps a tab list with one polite status region that says `label` (for
 * example "Loading…") while any tab's page is loading. The region is present
 * from the first render, so screen readers announce the change.
 */
export function TabStatus({ label, children }: { label: string; children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const report = useCallback<Report>((value) => setPending((count) => Math.max(0, count + (value ? 1 : -1))), []);
  return (
    <PendingReport.Provider value={report}>
      {children}
      <span role="status" className="ui-visually-hidden">{pending > 0 ? label : ""}</span>
    </PendingReport.Provider>
  );
}

/**
 * A small busy mark inside a tab link while its page is loading (tabs do not
 * prefetch, so a switch can take a moment). The mark itself is decorative;
 * inside TabStatus the loading is also announced.
 */
export function TabPending() {
  const { pending } = useLinkStatus();
  const report = useContext(PendingReport);
  useEffect(() => {
    if (!pending || !report) return;
    report(true);
    return () => report(false);
  }, [pending, report]);
  return <span className={styles.pending} data-tab-pending={pending ? "" : undefined} aria-hidden="true" />;
}
