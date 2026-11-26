import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { componentPreviewText } from "@/i18n/component-preview";
import { isLocale } from "@/i18n/locales";
import { localIdentity } from "@/server/identity/local";
import { readThemePreference } from "@/ui/server-theme";
import { ComponentPreview } from "./component-preview";

type Props = { params: Promise<{ locale: string }> };

// Development-only page, guarded like synthetic identity: it renders only when
// the loopback-only local launcher (npm run dev, or the browser test runner)
// has installed its in-memory context. Ordinary `next start` gets a 404, and no
// header, flag or request can enable it.
function requireDevelopmentPreview() {
  if (!localIdentity()) notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  requireDevelopmentPreview();
  return { title: componentPreviewText[locale].title, robots: { index: false, follow: false } };
}

export default async function ComponentPreviewPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  requireDevelopmentPreview();
  return <ComponentPreview locale={locale} serverTheme={await readThemePreference()} />;
}
