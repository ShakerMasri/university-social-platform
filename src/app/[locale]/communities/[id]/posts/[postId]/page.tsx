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
import { listComments } from "@/server/comments/service";
import { commentText } from "@/i18n/comments";
import { reportOperationalFailure } from "@/server/diagnostics";
import { CommentsList } from "./comments-list";
import { IdentityShell } from "../../../../identity-shell";
import { PostCard } from "../../post-card";
export const dynamic = "force-dynamic";
export default async function PostPage({ params, searchParams }: { params: Promise<{ locale: string; id: string; postId: string }>; searchParams: Promise<{ after?: string }> }) {
  const { locale, id, postId } = await params;
  if (!isLocale(locale)) notFound();
  try { communityId(id); communityId(postId); } catch { notFound(); }
  const query = await searchParams;
  try { if (Object.keys(query).some(key => key !== "after")) notFound(); if (query.after !== undefined) communityId(query.after); } catch { notFound(); }
  let post: Awaited<ReturnType<typeof readPost>> | undefined, comments: Awaited<ReturnType<typeof listComments>> | undefined, status = 503;
  let enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers());
    enabled = true;
    const db = identityDatabase(context), token = (await cookies()).get(sessionCookie)?.value;
    post = await readPost(db, token, id, postId);
    comments = await listComments(db, token, id, postId, query.after);
  } catch (error) {
    post = undefined;
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("comments.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path={`communities/${id}/posts/${postId}`}>
    <p><Link prefetch={false} href={`/${locale}/communities/${id}`}>{postText[locale].back}</Link></p>
    {post ? <PostCard locale={locale} post={post} detail /> : <><h1>{postText[locale].title}</h1><p role="alert">{status === 404 || status === 403 ? postText[locale].unavailable : identityText[locale].failed}</p></>}
    {post && comments && <section aria-labelledby="comments-heading">
      <h2 id="comments-heading">{commentText[locale].title}</h2>
      <CommentsList key={`${id}:${postId}:${query.after ?? ""}`} locale={locale} communityId={id} postId={postId} initial={comments} />
      {query.after && <p><Link prefetch={false} href={`/${locale}/communities/${id}/posts/${postId}`}>{commentText[locale].first}</Link></p>}
      <noscript>{comments.next && <p><Link prefetch={false} href={`/${locale}/communities/${id}/posts/${postId}?after=${comments.next}`}>{commentText[locale].next}</Link></p>}</noscript>
    </section>}
  </IdentityShell>;
}
