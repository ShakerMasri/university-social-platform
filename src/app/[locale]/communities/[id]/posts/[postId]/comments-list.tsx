"use client";
import { useState } from "react";
import type { Locale } from "@/i18n/locales";
import { commentText } from "@/i18n/comments";
import { CursorList } from "../../../cursor-list";
import { commentPageResponse, type CommentItem, type ContentPage } from "../../../content-data";
import { CommentThread } from "./comment-thread";
import { CommentForm } from "./comment-form";

export function CommentsList({ locale, communityId, postId, initial, notificationThread }: { locale: Locale; communityId: string; postId: string; initial: ContentPage<CommentItem> & { canComment: boolean }; notificationThread?: { rootId: string; replies: ContentPage<CommentItem> } }) {
  const text = commentText[locale], [published, setPublished] = useState<CommentItem[]>([]);
  return <CursorList initial={initial} endpoint={`/api/communities/${communityId}/posts/${postId}/comments`} parsePage={commentPageResponse} locale={locale} moreLabel={text.more} itemPrefix="comment">
    {items => {
      // Confirmed writes stay visible next to the composer even when their
      // chronological position is beyond the loaded pages. Once paging reaches
      // them, display only the ordinary list entry.
      const loaded = new Set(items.map(item => item.id)), recent = published.filter(item => !loaded.has(item.id));
      return <>
        {initial.canComment ? <CommentForm locale={locale} communityId={communityId} postId={postId} onPublished={comment => setPublished(previous => [comment, ...previous.filter(item => item.id !== comment.id)])} /> : <p>{text.hint}</p>}
        {recent.length > 0 && <section aria-label={text.justPublished}><h3>{text.justPublished}</h3><div className="community-list">{recent.map(comment => <CommentThread key={comment.id} locale={locale} comment={comment} communityId={communityId} postId={postId} canComment={initial.canComment} />)}</div></section>}
        {items.length === 0 && recent.length === 0 && <p>{text.empty}</p>}
        <div className="community-list">{items.map(comment => <CommentThread key={comment.id} locale={locale} comment={comment} communityId={communityId} postId={postId} canComment={initial.canComment} initialReplies={notificationThread?.rootId === comment.id ? notificationThread.replies : undefined} />)}</div>
      </>;
    }}
  </CursorList>;
}
