import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale, localeDirections, locales } from "@/i18n/locales";
import "../globals.css";

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

  return (
    <html lang={locale} dir={localeDirections[locale]}>
      <body>{children}</body>
    </html>
  );
}
