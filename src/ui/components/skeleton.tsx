"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { classNames } from "../class-names";
import styles from "./skeleton.module.css";

/** A placeholder shape. Hidden from assistive technology; wrap in SkeletonGroup. */
export function Skeleton({ shape = "block", inlineSize, blockSize, className }: {
  shape?: "block" | "text" | "circle"; inlineSize?: string; blockSize?: string; className?: string;
}) {
  const style: CSSProperties = { inlineSize: inlineSize ?? (shape === "circle" ? blockSize : "100%"), blockSize };
  return <span aria-hidden="true" className={classNames(styles.skeleton, shape !== "block" && styles[shape], className)} style={style} />;
}

/**
 * Loading placeholder region with one announced label (for example "Loading
 * posts…") instead of the shapes. The status region starts empty and is
 * filled after mount, because screen readers ignore text already present when
 * a live region appears. It sits outside the aria-busy container, which some
 * screen readers silence.
 */
export function SkeletonGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [announced, setAnnounced] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnnounced(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={className}>
      <span role="status" className="ui-visually-hidden">{announced ? label : ""}</span>
      <div className={styles.group} aria-busy="true">{children}</div>
    </div>
  );
}
