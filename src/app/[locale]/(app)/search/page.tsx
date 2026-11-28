import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { searchText } from "@/i18n/search";
import { archiveText } from "@/i18n/archive";
import { peopleText } from "@/i18n/people";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { ButtonLink } from "@/ui/components/button";
import { ErrorState } from "@/ui/components/state";
import { Tabs } from "@/ui/components/tabs";
import { loadViewer } from "@/app/[locale]/shell/viewer";
import { filterCommunities, peopleSearch, postSearch, type Outcome, type SearchContext } from "./search-data";
import { allTabPreviewSize, readSearchRequest, searchHref, searchSignature, type SearchRequest } from "./search-request";
import { KindEmpty, KindFailure, PeopleResultList, PostResultList, type PersonResult, type PostResult } from "./results";
import { SearchForm } from "./search-form";
import { FocusResults } from "./focus-results";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

type PostPage = { items: PostResult[]; next: string | null; interrupted: boolean };
type PeoplePage = { items: PersonResult[]; next: string | null };
const resultsHeadingId = "search-results-heading";

/**
 * Unified search (plan C1). Results render on the server from the URL, so
 * every render rechecks the viewer's current access: a refresh, back/forward
 * or shared link never shows results the viewer can no longer read. Each
 * kind fails independently, and counts are never shown.
 */
export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = searchText[locale];
  const request = readSearchRequest(await searchParams);
  const viewer = await loadViewer();
  if (viewer.state === "anonymous") redirect(`/${locale}/signin`);

  let context: SearchContext | undefined;
  if (viewer.state === "verified") {
    try {
      const identity = requireLocalIdentity(await headers());
      context = { db: identityDatabase(identity.context), token: (await cookies()).get(sessionCookie)?.value, cursorKey: identity.context.rateKey };
    } catch { reportOperationalFailure("search.page.failed"); }
  }
  if (!context) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>{text.title}</h1>
        <ErrorState title={archiveText[locale].failed} />
      </div>
    );
  }

  const searching = request.query !== "";
  const [posts, people, communities] = await Promise.all([
    searching && request.tab !== "people" ? postSearch(context, request) : undefined,
    searching && request.tab !== "posts" ? peopleSearch(context, request) : undefined,
    request.tab === "posts" ? filterCommunities(context, request) : undefined,
  ]) as [Outcome<PostPage> | undefined, Outcome<PeoplePage> | undefined, Outcome<{ items: { id: string; name: string }[]; more: boolean }> | undefined];
  if ([posts, people, communities].some((outcome) => outcome?.status === "signedOut")) redirect(`/${locale}/signin`);

  const tabs = (["all", "posts", "people"] as const).map((tab) => ({
    href: searchHref(locale, { tab, query: request.query, community: request.community, type: request.type }),
    label: text[tab],
    current: request.tab === tab,
  }));
  const options = communities?.status === "ok" ? communities.value : undefined;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{text.title}</h1>
      <SearchForm locale={locale} request={request} communities={options?.items} moreCommunities={options?.more} />
      <Tabs label={text.tabsLabel} items={tabs} prefetch={false} pendingLabel={archiveText[locale].loading} />
      <section className={styles.results} aria-labelledby={resultsHeadingId}>
        <h2 id={resultsHeadingId} tabIndex={-1} className={styles.resultsHeading}>{text.results}</h2>
        {communities && communities.status !== "ok" && communities.status !== "signedOut" && (
          <KindFailure locale={locale} kind="posts" failure={communities.status} paged={false} retryHref={searchHref(locale, request)} />
        )}
        {(communities === undefined || communities.status === "ok") && (
          searching ? <Results locale={locale} request={request} posts={posts} people={people} />
            : <p className={styles.prompt}>{request.tab === "posts" ? text.postsPrompt : request.tab === "people" ? text.peoplePrompt : text.prompt}</p>
        )}
      </section>
      <FocusResults targetId={resultsHeadingId} signature={searchSignature(request)} />
    </div>
  );
}

function Results({ locale, request, posts, people }: {
  locale: Locale; request: SearchRequest; posts?: Outcome<PostPage>; people?: Outcome<PeoplePage>;
}) {
  const text = searchText[locale];
  const retryHref = searchHref(locale, request);
  if (request.tab === "all") {
    return (
      <div className={styles.groups}>
        <section className={styles.group} aria-labelledby="search-posts-heading">
          <h3 id="search-posts-heading" className={styles.groupHeading}>{text.posts}</h3>
          <KindResult locale={locale} kind="posts" outcome={posts} preview request={request} retryHref={retryHref} />
        </section>
        <section className={styles.group} aria-labelledby="search-people-heading">
          <h3 id="search-people-heading" className={styles.groupHeading}>{text.people}</h3>
          <KindResult locale={locale} kind="people" outcome={people} preview request={request} retryHref={retryHref} />
        </section>
      </div>
    );
  }
  const kind = request.tab;
  return <KindResult locale={locale} kind={kind} outcome={kind === "posts" ? posts : people} request={request} retryHref={retryHref} />;
}

function KindResult({ locale, kind, outcome, preview = false, request, retryHref }: {
  locale: Locale; kind: "posts" | "people"; outcome?: Outcome<PostPage> | Outcome<PeoplePage>;
  preview?: boolean; request: SearchRequest; retryHref: string;
}) {
  const text = searchText[locale];
  const headingLevel = preview ? 4 : 3;
  if (!outcome || outcome.status === "signedOut") return null;
  if (outcome.status !== "ok") {
    return <KindFailure locale={locale} kind={kind} failure={outcome.status} paged={!preview && request.after !== undefined} retryHref={retryHref} headingLevel={headingLevel} />;
  }
  const page = outcome.value;
  if (page.items.length === 0) return <KindEmpty locale={locale} kind={kind} headingLevel={headingLevel} />;
  const items = preview ? page.items.slice(0, allTabPreviewSize) : page.items;
  const more = preview ? page.items.length > allTabPreviewSize || page.next !== null : page.next !== null;
  return (
    <>
      {kind === "posts" && "interrupted" in page && page.interrupted && <p className={styles.notice} role="status">{archiveText[locale].interrupted}</p>}
      {kind === "posts"
        ? <PostResultList locale={locale} items={items as PostResult[]} headingLevel={headingLevel} />
        : <PeopleResultList locale={locale} items={items as PersonResult[]} headingLevel={headingLevel} />}
      <div className={styles.pager}>
        {preview && more && (
          <ButtonLink prefetch={false} href={searchHref(locale, { tab: kind, query: request.query })}>
            {kind === "posts" ? text.seeAllPosts : text.seeAllPeople}
          </ButtonLink>
        )}
        {!preview && request.after && (
          <ButtonLink prefetch={false} href={searchHref(locale, { ...request, after: undefined })}>{text.firstResults}</ButtonLink>
        )}
        {!preview && page.next && (
          <ButtonLink prefetch={false} variant="primary" href={searchHref(locale, { ...request, after: page.next })}>
            {kind === "posts" ? archiveText[locale].next : peopleText[locale].next}
          </ButtonLink>
        )}
      </div>
    </>
  );
}
