import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import { identityText } from "@/i18n/identity";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { communityId } from "@/server/communities/policy";
import { CommunityError } from "@/server/communities/service";
import { readPost } from "@/server/posts/service";
import { IdentityShell } from "../../../../identity-shell";
import { PostCard } from "../../post-card";
export const dynamic = "force-dynamic";
export default async function PostPage({ params }: { params: Promise<{ locale: string; id: string; postId: string }> }) {
  const { locale, id, postId } = await params;
  if (!isLocale(locale)) notFound();
  try { communityId(id); communityId(postId); } catch { notFound(); }
  let post: Awaited<ReturnType<typeof readPost>> | undefined, status = 503;
  try {
    const { context } = requireLocalIdentity(await headers());
    post = await readPost(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, id, postId);
  } catch (error) { if (error instanceof CommunityError) status = error.status; }
  if (status === 401) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path={`communities/${id}/posts/${postId}`}>
    <p><Link prefetch={false} href={`/${locale}/communities/${id}`}>{postText[locale].back}</Link></p>
    {post ? <PostCard locale={locale} post={post} detail /> : <><h1>{postText[locale].title}</h1><p role="alert">{status === 404 || status === 403 ? postText[locale].unavailable : identityText[locale].failed}</p></>}
  </IdentityShell>;
}
