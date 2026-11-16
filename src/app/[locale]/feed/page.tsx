import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { feedText } from "@/i18n/feed";
import { authorized, CommunityError } from "@/server/communities/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { feedViewer } from "@/server/feed/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../identity-shell";
import { FeedList } from "./list";

export const dynamic = "force-dynamic";
export default async function Feed({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  return <IdentityShell locale={locale} path="feed">
    <div className="page-heading"><h1>{text.title}</h1><p>{text.intro}</p></div>
    {viewer ? <FeedList key={randomUUID()} locale={locale} viewer={viewer} /> : <p role="alert">{text.failed}</p>}
  </IdentityShell>;
}
