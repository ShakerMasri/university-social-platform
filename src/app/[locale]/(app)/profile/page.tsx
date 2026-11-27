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
import { ProfileForm } from "@/app/[locale]/identity-forms";
import { readPreferences } from "@/server/notifications/preferences";
import { NotificationPreferencesForm } from "../notifications/preferences-form";
import { uiText } from "@/i18n/ui";
import { ButtonLink } from "@/ui/components/button";
import { ErrorState } from "@/ui/components/state";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";
export default async function Profile({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // First sign-in step (onboarding): only while no display name is saved.
  const welcome = (await searchParams).welcome === "1";
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
    return <>
      <div className={styles.column}>
        <h1 className="ui-visually-hidden">{identityText[locale].profile}</h1>
        <ErrorState title={identityText[locale].failed} action={<ButtonLink href={`/${locale}/profile`}>{uiText[locale].retry}</ButtonLink>} />
      </div>
    </>;
  }
  if (!profile) redirect(`/${locale}/signin`);
  if (welcome && profile.displayName !== null) redirect(`/${locale}`);
  return <>
    <div className={styles.column}>
      <ProfileForm key={randomUUID()} locale={locale} profile={profile} welcome={welcome} />
      {!welcome && preferences && <NotificationPreferencesForm locale={locale} initial={preferences} />}
    </div>
  </>;
}
