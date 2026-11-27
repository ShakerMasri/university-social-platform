import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./tabs.module.css";

export type TabItem = { href: string; label: string; current: boolean; adornment?: ReactNode };

/**
 * URL-based tabs (feed and search tabs change the URL). These are navigation
 * links with aria-current, not an ARIA tablist: each tab is a page state that
 * can be linked, reloaded and opened in a new tab, and needs no script.
 */
export function Tabs({ label, items, prefetch }: {
  label: string;
  items: readonly TabItem[];
  /** Pass false when opening a tab does costly or budgeted work (search). */
  prefetch?: boolean;
}) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={prefetch} className={styles.tab} aria-current={item.current ? "page" : undefined}>
              {item.label}
              {item.adornment}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
