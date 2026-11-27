import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { uiText } from "@/i18n/ui";
import { ButtonLink } from "@/ui/components/button";
import { ToastProvider } from "@/ui/components/toast";
import type { Theme } from "@/ui/theme";
import { classNames } from "@/ui/class-names";
import type { Viewer } from "./viewer";
import { AccountMenu, HeaderSearch, HeaderSearchWithoutQuery, MobileBar, PrimaryNav } from "./shell-controls";
import { NotificationsButton } from "./notifications-button";
import { HeaderPreferences } from "./frame-parts";
import { HeaderBrand, ShellFooter, SkipLink } from "./frame-basics";
import styles from "./shell.module.css";

/**
 * The page frame's markup, with no data loading. The header shows only what
 * the viewer state allows: account controls for a verified session, Sign in
 * for an anonymous visitor, and neither when the session could not be
 * checked.
 */
export function ShellFrame({ locale, viewer, theme, children }: {
  locale: Locale; viewer: Viewer; theme: Theme | null; children: ReactNode;
}) {
  const text = shellText[locale];
  const account = viewer.state === "verified" ? viewer : null;
  const showNav = account !== null;

  return (
    <ToastProvider dismissLabel={uiText[locale].dismiss}>
      <div className={classNames(styles.shell, showNav && styles.hasMobileBar)}>
        <SkipLink locale={locale} />
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <HeaderBrand locale={locale} />
            {showNav && (
              <Suspense fallback={<HeaderSearchWithoutQuery locale={locale} />}>
                <HeaderSearch locale={locale} />
              </Suspense>
            )}
            <div className={styles.headerActions}>
              <HeaderPreferences locale={locale} theme={theme} />
              {account && <>
                <NotificationsButton locale={locale} initialUnread={account.unread} />
                <AccountMenu locale={locale} displayName={account.displayName} avatarSeed={account.avatarSeed} />
              </>}
              {viewer.state === "anonymous" && (
                <ButtonLink href={`/${locale}/signin`} variant="primary" size="compact">{text.signIn}</ButtonLink>
              )}
            </div>
          </div>
        </header>
        <div className={classNames(styles.body, showNav && styles.withNav)}>
          {showNav && <PrimaryNav locale={locale} />}
          <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
        </div>
        <ShellFooter locale={locale} />
        {showNav && <MobileBar locale={locale} />}
      </div>
    </ToastProvider>
  );
}
