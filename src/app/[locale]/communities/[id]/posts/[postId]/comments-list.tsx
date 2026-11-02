"use client";
import { useState } from "react";
import type { Locale } from "@/i18n/locales";
import { commentText } from "@/i18n/comments";
import { CursorList } from "../../../cursor-list";
import { commentPageResponse, type CommentItem, type ContentPage } from "../../../content-data";
import { CommentThread } from "./comment-thread";
import { CommentForm } from "./comment-form";
import Link from "next/link";

export function CommentsList({ locale, communityId, postId, initial, notificationThread }: { locale: Locale; communityId: string; postId: string; initial: ContentPage<CommentItem> & { canComment: boolean; commentRequirement: "membership" | "profile" | null }; notificationThread?: { rootId: string; replies: ContentPage<CommentItem> } }) {
  const text = commentText[locale], [published, setPublished] = useState<CommentItem[]>([]);
  return <CursorList initial={initial} endpoint={`/api/communities/${communityId}/posts/${postId}/comments`} parsePage={commentPageResponse} locale={locale} moreLabel={text.more} itemPrefix="comment">
    {items => {
      // Keep every root under one keyed parent. Paging can move a recent root
      // into chronological order without remounting its drafts or pending writes.
      const loaded = new Set(items.map(item => item.id)), recent = published.filter(item => !loaded.has(item.id));
      return <>
        {initial.canComment ? <CommentForm locale={locale} communityId={communityId} postId={postId} onPublished={comment => setPublished(previous => [comment, ...previous.filter(item => item.id !== comment.id)])} /> : <div className="comment-access">
          <p>{initial.commentRequirement === "membership" ? text.joinRequired : text.profileRequired}</p>
          <Link className="button-link" prefetch={false} href={initial.commentRequirement === "membership" ? `/${locale}/communities/${communityId}` : `/${locale}/profile`}>{initial.commentRequirement === "membership" ? text.openCommunity : text.saveProfile}</Link>
        </div>}
        {items.length === 0 && recent.length === 0 && <p>{text.empty}</p>}
        <div className="community-list">{[...recent, ...items].map(comment => <CommentThread key={comment.id} locale={locale} comment={comment} communityId={communityId} postId={postId} authorization={initial} recentlyPublished={!loaded.has(comment.id)} initialReplies={notificationThread?.rootId === comment.id ? notificationThread.replies : undefined} />)}</div>
      </>;
    }}
  </CursorList>;
}
