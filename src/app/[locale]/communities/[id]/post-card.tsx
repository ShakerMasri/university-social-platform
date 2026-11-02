import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import type { readPost } from "@/server/posts/service";
import { VoteControl } from "../vote-control";
export function PostCard({ locale, post, detail = false }: { locale: Locale; post: Awaited<ReturnType<typeof readPost>>; detail?: boolean }) {
  const text = postText[locale];
  return <article className={`community-card post-card${detail ? " post-detail" : ""}`} id={`post-${post.id}`} tabIndex={-1}>
    <p className="post-type"><span className="badge">{text.types[post.type]}</span></p>
    {detail ? <h1><bdi>{post.title}</bdi></h1> : <h3><bdi>{post.title}</bdi></h3>}
    <p className="content-attribution">{text.attribution}: <bdi>{post.authorName ?? text.deleted}</bdi> · <time dateTime={post.createdAt.toISOString()}>{post.createdAt.toLocaleDateString(locale === "ar" ? "ar" : "en", { timeZone: "UTC" })}</time></p>
    <p dir="auto" className="community-description">{post.body}</p>
    <VoteControl initial={post.vote} endpoint={`/api/communities/${post.communityId}/posts/${post.id}/vote`} locale={locale} />
    {post.resourceUrl && <p><a href={post.resourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{post.resourceUrl}</a></p>}
    {!detail && <p><Link prefetch={false} href={`/${locale}/communities/${post.communityId}/posts/${post.id}`}>{text.open}</Link></p>}
  </article>;
}
