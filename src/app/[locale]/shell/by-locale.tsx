"use client";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";

/**
 * Picks one of several server-rendered variants by the URL's locale segment.
 * For boundaries that receive no params (not-found): the variants stay server
 * components, so only this switch is sent to the browser.
 */
export function ByLocale({ en, ar, other }: { en: ReactNode; ar: ReactNode; other: ReactNode }) {
  const locale = useParams<{ locale: string }>().locale;
  return locale === "en" ? en : locale === "ar" ? ar : other;
}
