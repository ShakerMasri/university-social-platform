import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { archiveText } from "@/i18n/archive";
import { communityId } from "@/server/communities/policy";
import { CommunityError } from "@/server/communities/service";
import { archiveCommunities } from "@/server/archive/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../identity-shell";
import { ArchiveSearch } from "./search";
export const dynamic = "force-dynamic";
export default async function ArchivePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  let selected: string | undefined;
  try {
    if (Object.keys(query).some(key => key !== "community")) notFound();
    if (query.community !== undefined) selected = communityId(query.community);
  } catch { notFound(); }
  let options: Awaited<ReturnType<typeof archiveCommunities>> | undefined, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    options = await archiveCommunities(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, selected);
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("archive.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = archiveText[locale];
  return <IdentityShell locale={locale} path={selected ? `archive?community=${selected}` : "archive"}>
    <div className="page-heading"><h1>{text.title}</h1><p>{text.intro}</p></div>
    {/* Each authorized server snapshot owns fresh client state, including when
        an unscoped refresh returns the same scope or community choices. */}
    {options ? <ArchiveSearch key={randomUUID()} locale={locale} communities={options.items} moreCommunities={options.more} selected={selected} /> : <p role="alert">{status === 404 ? text.unavailable : text.failed}</p>}
  </IdentityShell>;
}
