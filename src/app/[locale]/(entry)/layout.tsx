import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { readThemePreference } from "@/ui/server-theme";
import { EntryFrame } from "../shell/frame-parts";

// Sign-in and verify: brand, theme and language only, with no session lookup.
// Imports only the slim frame, so these pages carry no account or navigation code.
export default async function EntryLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Rejected here, above every loading boundary, so the status is a real 404.
  if (!isLocale(locale)) notFound();
  return <EntryFrame locale={locale} theme={await readThemePreference()}>{children}</EntryFrame>;
}
