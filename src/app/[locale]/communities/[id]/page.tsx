import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { communityText } from "@/i18n/communities";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { CommunityError, readCommunity, listMemberships } from "@/server/communities/service";
import { communityId } from "@/server/communities/policy";
import { IdentityShell } from "../../identity-shell";
import { MembershipControls } from "../forms";
export const dynamic = "force-dynamic";
export default async function CommunityPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ after?: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const { after } = await searchParams;
  try { communityId(id); if (after !== undefined) communityId(after); } catch { notFound(); }
  const text = communityText[locale];
  let community: Awaited<ReturnType<typeof readCommunity>> | undefined;
  let members: Awaited<ReturnType<typeof listMemberships>> | undefined, status = 503;
  try {
    const { context } = requireLocalIdentity(await headers()), db = identityDatabase(context), token = (await cookies()).get(sessionCookie)?.value;
    community = await readCommunity(db, token, id);
    if (community.isOwner) members = await listMemberships(db, token, id, after);
  } catch (error) { community = undefined; if (error instanceof CommunityError) status = error.status; }
  if (status === 401) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path={`communities/${id}`}>
    <p><Link href={`/${locale}/communities`}>{text.back}</Link></p>
    {!community ? <><h1>{text.title}</h1><p role="alert">{status === 404 ? text.unavailable : status === 403 ? text.profileRequired : text.failed}</p></> : <>
      <h1><bdi>{community.name}</bdi></h1><p dir="auto" className="community-description">{community.description}</p>
      <p>{community.visibility === "PUBLIC" ? text.public : text.private} · {community.isOwner ? text.owner : community.membership === "MEMBER" ? text.joined : ""}</p>
      <p>{text.space}</p>
      {!community.isOwner && <MembershipControls locale={locale} id={id} visibility={community.visibility} membership={community.membership} actions={community.membership ? ["leave"] : ["join"]} />}
      {members && <section aria-labelledby="members-heading"><h2 id="members-heading">{text.members}</h2>
        {members.items.length === 0 ? <p>{text.noMembers}</p> : <ul className="community-list">{members.items.map((member) => <li key={member.userId} className="community-card">
          <p><bdi>{member.displayName ?? text.joined}</bdi> · {member.isOwner ? text.owner : member.status === "PENDING" ? text.pending : text.joined}</p>
          <p>{text.userId}: <bdi dir="ltr">{member.userId}</bdi></p>
          {!member.isOwner && <MembershipControls locale={locale} id={id} userId={member.userId} membership={member.status} actions={member.status === "PENDING" ? ["approve", "remove"] : ["remove"]} />}
        </li>)}</ul>}
        {members.next && <p><Link prefetch={false} href={`/${locale}/communities/${id}?after=${members.next}`}>{text.next}</Link></p>}
      </section>}
    </>}
  </IdentityShell>;
}
