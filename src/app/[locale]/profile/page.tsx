import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { ownProfile } from "@/server/identity/service";
import { sessionCookie } from "@/server/identity/policy";
import { IdentityShell } from "../identity-shell";
import { ProfileForm } from "../identity-forms";
import Link from "next/link";
import { communityText } from "@/i18n/communities";
import { readPreferences } from "@/server/notifications/preferences";
import { NotificationPreferencesForm } from "../notifications/preferences-form";

export const dynamic = "force-dynamic";
export default async function Profile({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let profile: Awaited<ReturnType<typeof ownProfile>>;
  let preferences: Awaited<ReturnType<typeof readPreferences>> | undefined;
  try {
    const { context } = requireLocalIdentity(await headers());
    const db = identityDatabase(context), token = (await cookies()).get(sessionCookie)?.value;
    profile = await ownProfile(db, token);
    if (profile) preferences = await readPreferences(db, token);
  } catch {
    return <IdentityShell locale={locale} path="profile"><h1>{identityText[locale].profile}</h1><p>{identityText[locale].failed}</p></IdentityShell>;
  }
  if (!profile) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path="profile"><ProfileForm locale={locale} profile={profile} /><p><Link prefetch={false} href={`/${locale}/communities`}>{communityText[locale].title}</Link></p>{preferences && <NotificationPreferencesForm locale={locale} initial={preferences} />}</IdentityShell>;
}
