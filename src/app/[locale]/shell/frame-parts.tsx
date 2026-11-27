import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { uiText } from "@/i18n/ui";
import { ThemeToggle } from "@/ui/components/theme-toggle";
import type { Theme } from "@/ui/theme";
import { LanguageLink, LanguageLinkWithoutQuery } from "./language-link";
import { HeaderBrand, ShellFooter, SkipLink } from "./frame-basics";
import styles from "./shell.module.css";

// The theme and language switches, and the slim frame for sign-in and
// verify. No account, navigation or toast code.

/** Theme and language switches. */
export function HeaderPreferences({ locale, theme }: { locale: Locale; theme: Theme | null }) {
  return (
    <>
      <ThemeToggle label={uiText[locale].darkTheme} serverTheme={theme} />
      <Suspense fallback={<LanguageLinkWithoutQuery locale={locale} />}>
        <LanguageLink locale={locale} />
      </Suspense>
    </>
  );
}

/** Sign-in and verify: brand, theme and language, narrow main. */
export function EntryFrame({ locale, theme, children }: { locale: Locale; theme: Theme | null; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SkipLink locale={locale} />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <HeaderBrand locale={locale} />
          <div className={styles.headerActions}><HeaderPreferences locale={locale} theme={theme} /></div>
        </div>
      </header>
      <div className={styles.body}>
        <main id="main-content" tabIndex={-1} className={`${styles.main} ${styles.entryMain}`}>{children}</main>
      </div>
      <ShellFooter locale={locale} />
    </div>
  );
}
