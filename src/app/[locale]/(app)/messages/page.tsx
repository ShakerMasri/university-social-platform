import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { MessagingPageShell } from "./page-shell";
export const dynamic = "force-dynamic";
export default async function Messages({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return <MessagingPageShell locale={locale} />;
}
