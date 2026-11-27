"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { locales, type Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import styles from "./shell.module.css";

const languageNames: Record<Locale, string> = { en: "English", ar: "العربية" };

function OtherLanguageLink({ locale, query }: { locale: Locale; query: string }) {
  const pathname = usePathname();
  const other = locales.find((candidate) => candidate !== locale)!;
  const rest = pathname.startsWith(`/${locale}`) ? pathname.slice(locale.length + 1) : "";
  return (
    <Link
      href={`/${other}${rest}${query ? `?${query}` : ""}`}
      lang={other} hrefLang={other} dir={other === "ar" ? "rtl" : "ltr"}
      className={styles.languageLink}
      title={shellText[locale].switchLanguage}
    >
      {languageNames[other]}
    </Link>
  );
}

/** Same page in the other language, keeping the query. */
export function LanguageLink({ locale }: { locale: Locale }) {
  return <OtherLanguageLink locale={locale} query={useSearchParams().toString()} />;
}

/** Suspense fallback for statically rendered pages: same path, no query. */
export function LanguageLinkWithoutQuery({ locale }: { locale: Locale }) {
  return <OtherLanguageLink locale={locale} query="" />;
}
