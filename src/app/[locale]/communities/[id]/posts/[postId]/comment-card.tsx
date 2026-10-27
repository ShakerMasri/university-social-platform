import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import type { CommentItem } from "../../../content-data";

export function CommentCard({ locale, comment }: { locale: Locale; comment: CommentItem }) {
  return <article className="community-card" id={`comment-${comment.id}`} tabIndex={-1}>
    <p>{postText[locale].attribution}: <bdi>{comment.authorName ?? postText[locale].deleted}</bdi> · <time dateTime={comment.createdAt.toISOString()}>{comment.createdAt.toLocaleDateString(locale, { timeZone: "UTC" })}</time></p>
    <p dir="auto" className="community-description">{comment.body}</p>
  </article>;
}
