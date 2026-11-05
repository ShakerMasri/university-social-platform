import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { peopleText } from "@/i18n/people";
import { communityId } from "@/server/communities/policy";
import { CommunityError } from "@/server/communities/service";
import { readDirectoryProfile } from "@/server/profiles/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../../identity-shell";
export const dynamic = "force-dynamic";
export default async function DirectoryProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params; if (!isLocale(locale)) notFound();
  try { communityId(id); } catch { notFound(); }
  let profile: Awaited<ReturnType<typeof readDirectoryProfile>> | undefined, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    profile = await readDirectoryProfile(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, id);
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("profiles.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = peopleText[locale];
  return <IdentityShell locale={locale} path={`people/${id}`}>
    <h1>{text.profile}</h1>
    {profile ? <><h2 dir="auto"><bdi>{profile.displayName}</bdi></h2><p>{text.notice}</p></> : <p role="alert">{status === 404 ? text.unavailable : status === 429 ? text.rate : text.failed}</p>}
    <Link href={`/${locale}/people`}>{text.back}</Link>
  </IdentityShell>;
}
