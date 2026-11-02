import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { communityText } from "@/i18n/communities";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { discoverCommunities, CommunityError } from "@/server/communities/service";
import { communityId } from "@/server/communities/policy";
import { IdentityShell } from "../identity-shell";
import { CreateCommunityForm, MembershipControls } from "./forms";
import { interfaceText } from "@/i18n/interface";
export const dynamic = "force-dynamic";
export default async function Communities({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ after?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = communityText[locale], { after } = await searchParams;
  if (after !== undefined) { try { communityId(after); } catch { notFound(); } }
  let listing: Awaited<ReturnType<typeof discoverCommunities>> | undefined, status = 503;
  try {
    const { context } = requireLocalIdentity(await headers());
    listing = await discoverCommunities(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, after);
  } catch (error) { if (error instanceof CommunityError) status = error.status; }
  if (status === 401) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path="communities">
    <div className="page-heading"><p className="eyebrow">{interfaceText[locale].discover}</p><h1>{text.title}</h1><p className="page-description">{interfaceText[locale].communitiesIntro}</p>{listing?.canCreate && <a className="button-link" href="#create-heading">{text.create}</a>}</div>
    {!listing ? <p role="alert">{status === 403 ? text.profileRequired : text.failed}</p> : <>
      <div className="discovery-layout"><section aria-labelledby="directory-heading"><h2 id="directory-heading">{interfaceText[locale].directory}</h2>
      {listing.items.length === 0 ? <div className="empty-state"><h3>{text.empty}</h3><p>{interfaceText[locale].emptyCommunities}</p></div> : <ul className="community-list">{listing.items.map((item) => <li key={item.id} className="community-card discovery-card">
        <p className="card-meta"><span className="badge">{item.visibility === "PUBLIC" ? text.public : text.private}</span>{(item.isOwner || item.membership) && <span>{item.isOwner ? text.owner : item.membership === "MEMBER" ? text.joined : text.pending}</span>}</p>
        <h3><bdi>{item.name}</bdi></h3><p className="community-description" dir="auto">{item.description}</p>
        {(item.visibility === "PUBLIC" || item.membership === "MEMBER" || item.isOwner) && <p><Link prefetch={false} href={`/${locale}/communities/${item.id}`}>{text.open}</Link></p>}
        {!item.isOwner && <MembershipControls locale={locale} id={item.id} visibility={item.visibility} membership={item.membership} actions={item.membership ? ["leave"] : ["join"]} />}
      </li>)}</ul>}
      {listing.next && <p><Link prefetch={false} href={`/${locale}/communities?after=${listing.next}`}>{text.next}</Link></p>}
      </section><div className="discovery-create">{listing.canCreate ? <CreateCommunityForm locale={locale} /> : <div className="form-panel"><p>{text.profileRequired}</p><Link href={`/${locale}/profile`}>{text.profile}</Link></div>}</div></div>
    </>}
  </IdentityShell>;
}
