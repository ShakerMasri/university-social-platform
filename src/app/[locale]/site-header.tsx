import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { dictionaries } from "@/i18n/dictionaries";
import { identityText } from "@/i18n/identity";
import { communityText } from "@/i18n/communities";
import { notificationText } from "@/i18n/notifications";
import { interfaceText } from "@/i18n/interface";
import { archiveText } from "@/i18n/archive";
import { peopleText } from "@/i18n/people";

export function SiteHeader({ locale, path = "", accountNavigation = false }: { locale: Locale; path?: string; accountNavigation?: boolean }) {
  const text = dictionaries[locale];
  const suffix = path ? `/${path}` : "";
  return <header className="site-header">
    <div className="header-top">
      <p className="project-title">{text.title}</p>
      <nav aria-label={text.languageNavigation}><ul className="language-list">
        <li><Link href={`/en${suffix}`} lang="en" dir="ltr" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link></li>
        <li><Link href={`/ar${suffix}`} lang="ar" dir="rtl" hrefLang="ar" aria-current={locale === "ar" ? "page" : undefined}>العربية</Link></li>
      </ul></nav>
    </div>
    {accountNavigation && <nav aria-label={interfaceText[locale].navigation} className="primary-navigation">
      <Link prefetch={false} href={`/${locale}/communities`} aria-current={path === "communities" ? "page" : path.startsWith("communities/") ? "location" : undefined}>{communityText[locale].title}</Link>
      <Link prefetch={false} href={`/${locale}/archive`} aria-current={path.split("?")[0] === "archive" ? "page" : undefined}>{archiveText[locale].title}</Link>
      <Link prefetch={false} href={`/${locale}/people`} aria-current={path === "people" ? "page" : path.startsWith("people/") ? "location" : undefined}>{peopleText[locale].title}</Link>
      <Link prefetch={false} href={`/${locale}/notifications`} aria-current={path === "notifications" ? "page" : undefined}>{notificationText[locale].title}</Link>
      <Link prefetch={false} href={`/${locale}/profile`} aria-current={path === "profile" ? "page" : undefined}>{identityText[locale].profile}</Link>
    </nav>}
  </header>;
}
