import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { dictionaries } from "@/i18n/dictionaries";
import { identityText } from "@/i18n/identity";
import { SiteHeader } from "./site-header";

export function IdentityShell({ locale, children, path }: { locale: Locale; children: ReactNode; path: "signin" | "verify" | "profile" | "notifications" | "archive" | `archive?community=${string}` | "communities" | `communities/${string}` | `communities/${string}/posts/${string}` }) {
  const text = dictionaries[locale];
  const identityPage = path === "signin" || path === "verify";
  return <div className="shell">
    <a className="skip-link" href="#main-content">{text.skipToContent}</a>
    <SiteHeader locale={locale} path={path} accountNavigation={!identityPage} />
    <main id="main-content" tabIndex={-1} className={`identity-main ${identityPage ? "identity-entry" : path === "communities" ? "directory-main" : "reading-main"}`}>
      <p className="project-status">{identityText[locale].local}</p>
      {children}
      <p className="home-link"><Link href={`/${locale}`}>{identityText[locale].home}</Link></p>
    </main>
    <footer><p>{text.footer}</p></footer>
  </div>;
}
