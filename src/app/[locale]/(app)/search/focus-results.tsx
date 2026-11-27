"use client";
import { useEffect } from "react";

/**
 * After a search (a new query, tab, filter or page), move focus to the
 * results heading, so keyboard and screen reader users land on the outcome.
 * Opening /search without a query leaves focus alone.
 */
export function FocusResults({ targetId, signature }: { targetId: string; signature: string }) {
  useEffect(() => {
    if (signature) document.getElementById(targetId)?.focus();
  }, [targetId, signature]);
  return null;
}
