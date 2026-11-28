"use client";
import { useLinkStatus } from "next/link";
import styles from "./tabs.module.css";

/**
 * A small busy mark inside a tab link while its page is loading (tabs do not
 * prefetch, so a switch can take a moment). Decorative: the page that opens
 * announces its own loading state.
 */
export function TabPending() {
  const { pending } = useLinkStatus();
  return <span className={styles.pending} data-tab-pending={pending ? "" : undefined} aria-hidden="true" />;
}
