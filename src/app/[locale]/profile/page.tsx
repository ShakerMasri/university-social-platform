import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { ownDirectoryProfile } from "@/server/profiles/service";
import { CommunityError } from "@/server/communities/service";
import { reportOperationalFailure } from "@/server/diagnostics";
import { sessionCookie } from "@/server/identity/policy";
import { IdentityShell } from "../identity-shell";
import { ProfileForm } from "../identity-forms";
import { readPreferences } from "@/server/notifications/preferences";
import { NotificationPreferencesForm } from "../notifications/preferences-form";

export const dynamic = "force-dynamic";
export default async function Profile({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let profile: Awaited<ReturnType<typeof ownDirectoryProfile>>;
  let preferences: Awaited<ReturnType<typeof readPreferences>> | undefined;
  let enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers());
    enabled = true;
    const db = identityDatabase(context), token = (await cookies()).get(sessionCookie)?.value;
    profile = await ownDirectoryProfile(db, token);
    if (profile) preferences = await readPreferences(db, token);
  } catch (error) {
    if (error instanceof CommunityError && error.status === 401) redirect(`/${locale}/signin`);
    if (enabled) reportOperationalFailure("profiles.page.failed");
    return <IdentityShell locale={locale} path="profile"><h1>{identityText[locale].profile}</h1><p>{identityText[locale].failed}</p></IdentityShell>;
  }
  if (!profile) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path="profile"><div className="form-panel"><ProfileForm key={randomUUID()} locale={locale} profile={profile} /></div>{preferences && <NotificationPreferencesForm locale={locale} initial={preferences} />}</IdentityShell>;
}
