import Link from "next/link";
import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/locales";
import { SiteHeader } from "./site-header";
import { identityText } from "@/i18n/identity";
import { communityText } from "@/i18n/communities";
import { cookies, headers } from "next/headers";
import { identityDatabase, localIdentity, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie, tokenValid } from "@/server/identity/policy";
import { authorized, CommunityError } from "@/server/communities/service";
import { reportOperationalFailure } from "@/server/diagnostics";
import { HomeSessionRefresh } from "./home-session-refresh";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = dictionaries[locale];
  let session: "anonymous" | "verified" | "unavailable" = "anonymous";
  // Ordinary startup has no installed identity provider. Cookies/headers cannot
  // enable it. Missing/malformed credentials need no database work.
  const token = (await cookies()).get(sessionCookie)?.value;
  if (localIdentity() && tokenValid(token)) {
    try {
      const { context } = requireLocalIdentity(await headers());
      // Uses current verification/revocation and a final database-time expiry
      // check. No profile requirement, write, directory enrollment or PII projection.
      await authorized(identityDatabase(context), token, async () => true);
      session = "verified";
    } catch (error) {
      if (!(error instanceof CommunityError && error.status === 401)) {
        session = "unavailable";
        reportOperationalFailure("identity.home.failed");
      }
    }
  }

  return (
    <div className="shell">
      <HomeSessionRefresh />
      <a className="skip-link" href="#main-content">{text.skipToContent}</a>
      <SiteHeader locale={locale} accountNavigation={session === "verified"} />
      <main id="main-content" tabIndex={-1} className="home-main">
        <h1>{text.heading}</h1>
        <p className="introduction">{text.introduction}</p>
        {session === "unavailable" ? <>
          <p role="alert">{identityText[locale].homeUnavailable}</p>
          <p><a href={`/${locale}`}>{identityText[locale].retryHome}</a></p>
        </> : <p className="home-actions"><Link prefetch={false} className="button-link" href={`/${locale}/${session === "verified" ? "communities" : "signin"}`}>{session === "verified" ? communityText[locale].title : identityText[locale].signIn}</Link></p>}
        <p className="project-status">{text.status}</p>
      </main>
      <footer><p>{text.footer}</p></footer>
    </div>
  );
}
