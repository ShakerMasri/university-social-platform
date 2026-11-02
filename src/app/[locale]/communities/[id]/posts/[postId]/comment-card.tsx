import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import type { CommentItem } from "../../../content-data";
import { VoteControl } from "../../../vote-control";
import { replyText } from "@/i18n/replies";

export function CommentCard({ locale, comment, communityId, postId, onReply }: { locale: Locale; comment: CommentItem; communityId: string; postId: string; onReply?: (comment: CommentItem) => void }) {
  return <article className="community-card comment-card" id={`comment-${comment.id}`} tabIndex={-1}>
    <p className="content-attribution">{postText[locale].attribution}: <bdi>{comment.authorName ?? postText[locale].deleted}</bdi> · <time dateTime={comment.createdAt.toISOString()}>{comment.createdAt.toLocaleDateString(locale, { timeZone: "UTC" })}</time></p>
    <p dir="auto" className="community-description">{comment.body}</p>
    {comment.replyToId && <p>{replyText[locale].replyingTo}: <bdi>{comment.replyToName ?? postText[locale].deleted}</bdi></p>}
    <div className="content-actions">
      <VoteControl initial={comment.vote} endpoint={`/api/communities/${communityId}/posts/${postId}/comments/${comment.id}/vote`} locale={locale} />
      {onReply && <button className="text-action" type="button" onClick={() => onReply(comment)}>{replyText[locale].reply}</button>}
    </div>
  </article>;
}
