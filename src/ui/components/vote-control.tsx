"use client";
import { useId } from "react";
import { useHydrated } from "@/app/use-hydrated";
import { ArrowDownIcon, ArrowUpIcon } from "../icons";
import styles from "./vote-control.module.css";

export type VoteDirection = "up" | "down";

/**
 * Names from the votes dictionary (src/i18n/votes.ts). Button names stay the
 * same in both states ("Upvote"); aria-pressed tells whether it is applied.
 */
export type VoteControlLabels = { group: string; upvotes: string; downvotes: string; add: string; down: string };

export type VoteControlProps = {
  up: number;
  down: number;
  current: VoteDirection | null;
  locale: string;
  labels: VoteControlLabels;
  /** Called with the arrow pressed; pressing the current vote again removes it. Omit for a read-only display. */
  onVote?: (direction: VoteDirection) => void;
  disabled?: boolean;
  /** A vote is being saved: buttons stay focusable but ignore presses. */
  pending?: boolean;
};

/**
 * Up and down vote pill (approved 2026-11-03 decision): each arrow shows its
 * own count, with no net score. The current vote's arrow is filled and
 * aria-pressed. Presentational: the caller saves the vote and reports results.
 */
export function VoteControl({ up, down, current, locale, labels, onVote, disabled = false, pending = false }: VoteControlProps) {
  const hydrated = useHydrated();
  const id = useId();
  const inactive = disabled || !onVote || !hydrated;
  const format = new Intl.NumberFormat(locale);

  function press(direction: VoteDirection) {
    if (!pending) onVote?.(direction);
  }

  return (
    <div role="group" aria-label={labels.group} className={styles.pill} aria-busy={pending || undefined}>
      <button
        type="button" className={styles.vote} disabled={inactive}
        aria-pressed={current === "up"} aria-label={labels.add}
        aria-describedby={`${id}-up`} onClick={() => press("up")}
      >
        <ArrowUpIcon filled={current === "up"} size={18} />
        <span className={styles.count} id={`${id}-up`}>
          <span className="ui-visually-hidden">{labels.upvotes}: </span>
          <bdi>{format.format(up)}</bdi>
        </span>
      </button>
      <span className={styles.divider} aria-hidden="true" />
      <button
        type="button" className={styles.vote} disabled={inactive}
        aria-pressed={current === "down"} aria-label={labels.down}
        aria-describedby={`${id}-down`} onClick={() => press("down")}
      >
        <ArrowDownIcon filled={current === "down"} size={18} />
        <span className={styles.count} id={`${id}-down`}>
          <span className="ui-visually-hidden">{labels.downvotes}: </span>
          <bdi>{format.format(down)}</bdi>
        </span>
      </button>
    </div>
  );
}
