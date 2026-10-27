import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { dictionaries } from "@/i18n/dictionaries";
import { identityText } from "@/i18n/identity";

export function IdentityShell({ locale, children, path }: { locale: Locale; children: ReactNode; path: "signin" | "verify" | "profile" | "communities" | `communities/${string}` | `communities/${string}/posts/${string}` }) {
  const text = dictionaries[locale];
  return <div className="shell">
    <a className="skip-link" href="#main-content">{text.skipToContent}</a>
    <header className="site-header">
      <p className="project-title">{text.title}</p>
      <nav aria-label={text.languageNavigation}><ul className="language-list">
        <li><Link href={`/en/${path}`} lang="en" dir="ltr" aria-current={locale === "en" ? "page" : undefined}>English</Link></li>
        <li><Link href={`/ar/${path}`} lang="ar" dir="rtl" aria-current={locale === "ar" ? "page" : undefined}>العربية</Link></li>
      </ul></nav>
    </header>
    <main id="main-content" tabIndex={-1} className="identity-main">
      <p className="project-status">{identityText[locale].local}</p>
      {children}
      <p><Link href={`/${locale}`}>{identityText[locale].home}</Link></p>
    </main>
    <footer><p>{text.footer}</p></footer>
  </div>;
}
