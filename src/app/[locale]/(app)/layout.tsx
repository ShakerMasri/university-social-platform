import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { AppShell } from "../shell/app-shell";

// Signed-in pages share one persistent shell, so loading states keep the
// header and navigation. Pages reject unsupported locales with notFound().
export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Rejected here, above every loading boundary, so the status is a real 404.
  if (!isLocale(locale)) notFound();
  return <AppShell locale={locale}>{children}</AppShell>;
}
