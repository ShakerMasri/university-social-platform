import Link from "next/link";
import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/locales";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = dictionaries[locale];

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">{text.skipToContent}</a>
      <header className="site-header">
        <p className="project-title">{text.title}</p>
        <nav aria-label={text.languageNavigation}>
          <ul className="language-list">
            <li>
              <Link href="/en" lang="en" dir="ltr" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link>
            </li>
            <li>
              <Link href="/ar" lang="ar" dir="rtl" hrefLang="ar" aria-current={locale === "ar" ? "page" : undefined}>العربية</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <h1>{text.heading}</h1>
        <p className="introduction">{text.introduction}</p>
        <p className="project-status">{text.status}</p>
      </main>
      <footer><p>{text.footer}</p></footer>
    </div>
  );
}
