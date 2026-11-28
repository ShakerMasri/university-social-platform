import { notFound, redirect } from "next/navigation";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { shellText } from "@/i18n/shell";
import { homeText } from "@/i18n/home";
import { feedText } from "@/i18n/feed";
import { ButtonLink } from "@/ui/components/button";
import { ErrorState } from "@/ui/components/state";
import { Tabs } from "@/ui/components/tabs";
import { loadViewer } from "@/app/[locale]/shell/viewer";
import { HomeSessionRefresh } from "./home-session-refresh";
import { loadFeedViewer } from "../feed/feed-viewer";
import { FeedList } from "../feed/list";
import { homeHref, readHomeTab } from "../home/home-href";
import { Composer } from "../home/composer";
import { HomeSidePanel } from "../home/side-panel";
import styles from "./home.module.css";
import homeStyles from "../home/home.module.css";

export const dynamic = "force-dynamic";

/**
 * Anonymous visitors get a short landing page. Verified users get Home: the
 * composer, the feed tabs and the feed, and on wide screens the side panel
 * (plan decision 1). When the session cannot be checked, neither Sign in
 * nor account content is shown.
 */
export default async function Home({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const tab = readHomeTab(await searchParams);
  if (!tab) redirect(homeHref(locale));
  const site = dictionaries[locale], text = shellText[locale], home = homeText[locale];
  const viewer = await loadViewer();
  const feed = viewer.state === "verified" ? await loadFeedViewer() : null;
  if (feed?.state === "signed-out") redirect(`/${locale}/signin`);

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
        <div className={homeStyles.home}>
          <div className={homeStyles.feedColumn}>
            <h1 className="ui-visually-hidden">{home.heading}</h1>
            <Composer key={feed?.state === "ready" ? feed.viewer : "unchecked"} locale={locale} displayName={viewer.displayName} avatarSeed={viewer.avatarSeed} />
            <Tabs label={home.feedTabs} prefetch={false} items={[
              { href: homeHref(locale), label: home.tabCommunities, current: tab === "communities" },
              { href: homeHref(locale, "for-you"), label: home.tabForYou, current: tab === "for-you" },
            ]} />
            {/* Keyed by viewer and tab inside FeedList: a Home refresh with the
                same account keeps the feed, another account or tab restarts it. */}
            {feed?.state === "ready"
              ? <FeedList locale={locale} viewer={feed.viewer} forYou={tab === "for-you"} />
              : <ErrorState headingLevel={2} title={feedText[locale].failed} action={<a href={homeHref(locale, tab)}>{home.reload}</a>} />}
          </div>
          <HomeSidePanel locale={locale} />
        </div>
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
