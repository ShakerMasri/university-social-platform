import Link from "next/link";
import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/locales";
import { SiteHeader } from "./site-header";
import { identityText } from "@/i18n/identity";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = dictionaries[locale];

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">{text.skipToContent}</a>
      <SiteHeader locale={locale} />
      <main id="main-content" tabIndex={-1} className="home-main">
        <h1>{text.heading}</h1>
        <p className="introduction">{text.introduction}</p>
        <p className="home-actions"><Link className="button-link" href={`/${locale}/signin`}>{identityText[locale].signIn}</Link></p>
        <p className="project-status">{text.status}</p>
      </main>
      <footer><p>{text.footer}</p></footer>
    </div>
  );
}
