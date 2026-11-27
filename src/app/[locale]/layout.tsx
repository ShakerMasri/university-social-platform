import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dictionaries } from "@/i18n/dictionaries";
import { defaultLocale, isLocale, localeDirections, locales } from "@/i18n/locales";
import { fontVariableClasses } from "@/ui/fonts";
import { readThemePreference } from "@/ui/server-theme";
import "@/ui/tokens.css";
import "@/ui/base.css";
import "./legacy-pages.css";

type Props = { params: Promise<{ locale: string }>; children: ReactNode };

// Any first segment reaches this layout, so an unsupported locale (for example
// /fr) gets the app's own 404 rather than the framework's. Every page rejects
// an unsupported locale with notFound(); the layout renders it in English
// direction and the not-found view shows it in both languages.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { title: "404" };
  return { title: dictionaries[locale].title, description: dictionaries[locale].description };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: segment } = await params;
  const locale = isLocale(segment) ? segment : defaultLocale;
  // Server-rendered theme: an explicit choice comes from the cookie. Without one,
  // the CSS follows the system preference, so first paint never flashes.
  const theme = await readThemePreference();

  return (
    <html lang={locale} dir={localeDirections[locale]} data-theme={theme ?? undefined} className={fontVariableClasses}>
      <body className="ui-root">{children}</body>
    </html>
  );
}
