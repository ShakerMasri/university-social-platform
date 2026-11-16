import Link from "next/link";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { peopleText } from "@/i18n/people";
import { communityId } from "@/server/communities/policy";
import { authorized, CommunityError } from "@/server/communities/service";
import { readDirectoryProfile } from "@/server/profiles/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../../identity-shell";
import { MessageComposer } from "../../messages/composer";
import { messagingText } from "@/i18n/messaging";
export const dynamic = "force-dynamic";
export default async function DirectoryProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params; if (!isLocale(locale)) notFound();
  let directoryId: string;
  try { directoryId = communityId(id); } catch { notFound(); }
  let profile: Awaited<ReturnType<typeof readDirectoryProfile>> | undefined, status = 503, enabled = false;
  let ownDirectoryId: string | null = null;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    const db = identityDatabase(context), token = (await cookies()).get(sessionCookie)?.value;
    const found = await readDirectoryProfile(db, token, directoryId);
    ownDirectoryId = await authorized(db, token, async (tx, actor) => (await tx.profile.findUnique({ where: { userId: actor }, select: { directoryId: true } }))?.directoryId ?? null);
    profile = found;
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("profiles.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = peopleText[locale];
  return <IdentityShell locale={locale} path={`people/${directoryId}`}>
    <h1>{text.profile}</h1>
    {profile ? <><h2 dir="auto"><bdi>{profile.displayName}</bdi></h2><p>{text.notice}</p>
      {ownDirectoryId === null ? <p><Link href={`/${locale}/profile`}>{messagingText[locale].setup}</Link></p> : ownDirectoryId !== profile.id && <>
        <h3>{messagingText[locale].contact}</h3><MessageComposer key={randomUUID()} locale={locale} scope={ownDirectoryId} endpoint={`/api/people/${profile.id}/messages`} />
      </>}
    </> : <p role="alert">{status === 404 ? text.unavailable : status === 429 ? text.rate : text.failed}</p>}
    <Link href={`/${locale}/people`}>{text.back}</Link>
  </IdentityShell>;
}
