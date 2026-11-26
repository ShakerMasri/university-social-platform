import type { ReactNode } from "react";
import { classNames } from "../class-names";
import { formatCount } from "../format-count";
import styles from "./badge.module.css";

export type BadgeTone = "neutral" | "accent" | "danger" | "question" | "discussion" | "resource" | "announcement";

/** A short label, such as a post type or a state. */
export function Badge({ tone = "neutral", icon, children, className }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={classNames(styles.badge, styles[tone], className)}>{icon}{children}</span>;
}

/**
 * A numeric count, capped for display (for example "99+"). The visible number
 * is decorative; `label` is the full accessible text, such as "3 unread".
 * Renders nothing for zero.
 */
export function CountBadge({ count, label, locale, cap = 99, className }: { count: number; label: string; locale: string; cap?: number; className?: string }) {
  const text = formatCount(count, locale, cap);
  if (!text) return null;
  return (
    <span className={classNames(styles.badge, styles.count, className)}>
      <span aria-hidden="true">{text}</span>
      <span className="ui-visually-hidden">{label}</span>
    </span>
  );
}

/** A small unread indicator dot; `label` names it for assistive technology. */
export function DotBadge({ label, className }: { label: string; className?: string }) {
  return <span className={classNames(styles.dot, className)} role="img" aria-label={label} />;
}
