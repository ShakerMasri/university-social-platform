import { randomUUID } from "node:crypto";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { feedText } from "@/i18n/feed";
import { authorized, CommunityError } from "@/server/communities/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { feedViewer } from "@/server/feed/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { FeedList } from "./list";

export type FeedPageProps = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function FeedPageView({ params, searchParams, forYou = false }: FeedPageProps & { forYou?: boolean }) {
  const { locale } = await params;
  if (!isLocale(locale) || Object.keys(await searchParams).length) notFound();
  let viewer: string | undefined, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    viewer = await authorized(identityDatabase(context), (await cookies()).get(sessionCookie)?.value,
      async (_tx, userId) => feedViewer(userId, context.rateKey));
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("feed.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = feedText[locale];
  return <>
    <div className="page-heading"><h1>{forYou ? text.forYou : text.title}</h1><p>{forYou ? text.forYouIntro : text.intro}</p></div>
    <nav aria-label={text.navigation} className="primary-navigation">
      <Link prefetch={false} href={`/${locale}/feed`} aria-current={!forYou ? "page" : undefined}>{text.title}</Link>
      <Link prefetch={false} href={`/${locale}/feed/for-you`} aria-current={forYou ? "page" : undefined}>{text.forYou}</Link>
    </nav>
    {viewer ? <FeedList key={randomUUID()} locale={locale} viewer={viewer} forYou={forYou} /> : <p role="alert">{text.failed}</p>}
  </>;
}
