import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { dictionaries } from "@/i18n/dictionaries";
import { shellText } from "@/i18n/shell";
import { LogoMark } from "@/ui/icons";
import styles from "./shell.module.css";

// Frame pieces with no client code at all. The 404 boundary sits above every
// page and anything it imports as client code is sent to every route, so it
// builds its frame only from these.

export function SkipLink({ locale }: { locale: Locale }) {
  return <a className={styles.skipLink} href="#main-content">{dictionaries[locale].skipToContent}</a>;
}

export function HeaderBrand({ locale }: { locale: Locale }) {
  return (
    <Link prefetch={false} href={`/${locale}`} className={styles.brand}>
      <LogoMark />
      <span className={styles.brandName}>{dictionaries[locale].title}</span>
    </Link>
  );
}

export function ShellFooter({ locale }: { locale: Locale }) {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerInner}>{shellText[locale].footer}</p>
    </footer>
  );
}

/** The 404 frame: skip link, home link and footer only. */
export function BareFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SkipLink locale={locale} />
      <header className={styles.header}>
        <div className={styles.headerInner}><HeaderBrand locale={locale} /></div>
      </header>
      <div className={styles.body}>
        <main id="main-content" tabIndex={-1} className={`${styles.main} ${styles.entryMain}`}>{children}</main>
      </div>
      <ShellFooter locale={locale} />
    </div>
  );
}
