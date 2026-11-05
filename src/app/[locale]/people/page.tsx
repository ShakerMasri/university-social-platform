import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { peopleText } from "@/i18n/people";
import { authorized, CommunityError } from "@/server/communities/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../identity-shell";
import { PeopleSearch } from "./search";
export const dynamic = "force-dynamic";
export default async function PeoplePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  let ready = false, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    ready = await authorized(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, async () => true);
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("profiles.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = peopleText[locale];
  return <IdentityShell locale={locale} path="people">
    <div className="page-heading"><h1>{text.title}</h1><p>{text.intro}</p></div>
    {ready ? <PeopleSearch key={randomUUID()} locale={locale} /> : <p role="alert">{text.failed}</p>}
  </IdentityShell>;
}
