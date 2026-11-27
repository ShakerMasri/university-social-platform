import { notFound } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { shellText } from "@/i18n/shell";
import { ButtonLink } from "@/ui/components/button";
import { ErrorState } from "@/ui/components/state";
import { loadViewer } from "@/app/[locale]/shell/viewer";
import { HomeSessionRefresh } from "./home-session-refresh";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

/**
 * Anonymous visitors get a short landing page. Verified users get a start
 * page until Stage 2 makes Home the feed (plan decision 1). When the session
 * cannot be checked, neither Sign in nor account content is shown.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const site = dictionaries[locale], text = shellText[locale];
  const viewer = await loadViewer();

  return (
    <>
      <HomeSessionRefresh />
      {viewer.state === "anonymous" && (
        <section className={styles.landing} aria-labelledby="home-heading">
          <h1 id="home-heading" className={styles.heading}>{site.heading}</h1>
          <p className={styles.introduction}>{site.introduction}</p>
          <p className={styles.actions}>
            <ButtonLink href={`/${locale}/signin`} variant="primary">{text.landingSignIn}</ButtonLink>
          </p>
        </section>
      )}
      {viewer.state === "verified" && (
        <section className={styles.start} aria-labelledby="home-heading">
          <h1 id="home-heading" className={styles.heading}>{text.welcome}</h1>
          <p className={styles.introduction}>{text.welcomeIntro}</p>
          <ul className={styles.startLinks}>
            <li><ButtonLink href={`/${locale}/feed`} variant="primary">{text.startFeed}</ButtonLink></li>
            <li><ButtonLink href={`/${locale}/feed/for-you`}>{text.startForYou}</ButtonLink></li>
            <li><ButtonLink href={`/${locale}/communities`}>{text.startCommunities}</ButtonLink></li>
          </ul>
        </section>
      )}
      {viewer.state === "unavailable" && (
        <>
          <h1 className="ui-visually-hidden">{site.title}</h1>
          <ErrorState
            announce
            title={text.sessionUnavailable}
            description={identityText[locale].homeUnavailable}
            action={<a href={`/${locale}`}>{identityText[locale].retryHome}</a>}
          />
        </>
      )}
    </>
  );
}
