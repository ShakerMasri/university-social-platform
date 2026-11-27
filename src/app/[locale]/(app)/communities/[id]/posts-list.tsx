"use client";
import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import { CursorList } from "../cursor-list";
import { postPageResponse, type ContentPage, type PostItem } from "../content-data";
import { CreatePostForm } from "./post-form";
import { PostCard } from "./post-card";

export function PostsList({ locale, communityId, initial }: { locale: Locale; communityId: string; initial: ContentPage<PostItem> & { canPost: boolean; canAnnounce: boolean } }) {
  const text = postText[locale];
  return <CursorList initial={initial} endpoint={`/api/communities/${communityId}/posts`} parsePage={postPageResponse} locale={locale} moreLabel={text.more} itemPrefix="post">
    {items => <>
      {initial.canPost ? <CreatePostForm locale={locale} communityId={communityId} canAnnounce={initial.canAnnounce} /> : <p>{text.joinHint}</p>}
      {items.length ? <div className="community-list">{items.map(post => <PostCard key={post.id} locale={locale} post={post} />)}</div> : <p>{text.empty}</p>}
    </>}
  </CursorList>;
}
