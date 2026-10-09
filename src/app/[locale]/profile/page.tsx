import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { ownProfile } from "@/server/identity/service";
import { sessionCookie } from "@/server/identity/policy";
import { IdentityShell } from "../identity-shell";
import { ProfileForm } from "../identity-forms";

export const dynamic = "force-dynamic";
export default async function Profile({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let profile: Awaited<ReturnType<typeof ownProfile>>;
  try {
    const { context } = requireLocalIdentity(await headers());
    profile = await ownProfile(await identityDatabase(context), (await cookies()).get(sessionCookie)?.value);
  } catch {
    return <IdentityShell locale={locale} path="profile"><h1>{identityText[locale].profile}</h1><p>{identityText[locale].failed}</p></IdentityShell>;
  }
  if (!profile) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path="profile"><ProfileForm locale={locale} profile={profile} /></IdentityShell>;
}
