import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale, localeDirections, locales } from "@/i18n/locales";
import { fontVariableClasses } from "@/ui/fonts";
import { readThemePreference } from "@/ui/server-theme";
// Old harness CSS first, so the new base styles win inside .ui-root. Stage 1
// deletes globals.css.
import "../globals.css";
import "@/ui/tokens.css";
import "@/ui/base.css";

type Props = { params: Promise<{ locale: string }>; children: ReactNode };

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: dictionaries[locale].title, description: dictionaries[locale].description };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Server-rendered theme: an explicit choice comes from the cookie. Without one,
  // the CSS follows the system preference, so first paint never flashes.
  const theme = await readThemePreference();

  return (
    <html lang={locale} dir={localeDirections[locale]} data-theme={theme ?? undefined} className={fontVariableClasses}>
      <body>{children}</body>
    </html>
  );
}
