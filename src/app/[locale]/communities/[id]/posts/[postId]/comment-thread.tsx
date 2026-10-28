"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { replyText } from "@/i18n/replies";
import { commentText } from "@/i18n/comments";
import { postText } from "@/i18n/posts";
import { useHydrated } from "@/app/use-hydrated";
import { CursorList } from "../../../cursor-list";
import { commentPageResponse, type CommentItem, type ContentPage } from "../../../content-data";
import { CommentCard } from "./comment-card";
import { CommentForm } from "./comment-form";

export function CommentThread({ locale, comment, communityId, postId, canComment, initialReplies }: { locale: Locale; comment: CommentItem; communityId: string; postId: string; canComment: boolean; initialReplies?: ContentPage<CommentItem> }) {
  const text = replyText[locale], hydrated = useHydrated(), router = useRouter(), composer = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<CommentItem | null>(null), [page, setPage] = useState<ContentPage<CommentItem> | null>(initialReplies ?? null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle"), [published, setPublished] = useState<CommentItem[]>([]);
  const endpoint = `/api/communities/${communityId}/posts/${postId}/comments/${comment.id}/replies`;
  useEffect(() => { if (target) composer.current?.querySelector("textarea")?.focus(); }, [target]);
  function reply(item: CommentItem) {
    setTarget(item);
  }
  async function load() {
    if (state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if ([401, 403, 404].includes(response.status)) {
        setPage(null); setPublished([]); setTarget(null); setState("failed"); router.refresh(); return;
      }
      if (!response.ok) throw new Error("Unavailable replies");
      setPage(commentPageResponse(await response.json())); setState("idle");
    } catch {
      // A failed read does not undo a confirmed write or discard an unsent draft.
      // Only an explicit access denial above invalidates that local content.
      setState("failed");
    }
  }
  const card = (item: CommentItem) => <CommentCard key={item.id} locale={locale} comment={item} communityId={communityId} postId={postId} onReply={canComment && hydrated ? reply : undefined} />;
  return <div>
    {card(comment)}
    <div className="comment-replies">
      {initialReplies && <button type="button" disabled={!hydrated || state === "loading"} onClick={() => void load()}>{text.first}</button>}
      {target && <div ref={composer}>
        <p>{text.replyingTo}: <bdi>{target.authorName ?? postText[locale].deleted}</bdi></p>
        <button type="button" onClick={() => { setTarget(null); document.getElementById(`comment-${comment.id}`)?.focus(); }}>{text.cancel}</button>
        <CommentForm key={target.id} locale={locale} communityId={communityId} postId={postId} replyToId={target.id} onPublished={item => setPublished(previous => [...previous.filter(row => row.id !== item.id), item])} />
      </div>}
      {!page && <button type="button" disabled={!hydrated || state === "loading"} onClick={() => void load()}>{state === "loading" ? text.loading : text.show}</button>}
      {state === "failed" && <p role="alert">{text.failed}</p>}
      {page ? <CursorList initial={page} endpoint={endpoint} parsePage={commentPageResponse} locale={locale} moreLabel={text.more} itemPrefix="comment">
        {items => {
          const recent = published.filter(row => !items.some(item => item.id === row.id));
          return <>{recent.length > 0 && <section aria-label={commentText[locale].justPublished}><h4>{commentText[locale].justPublished}</h4>{recent.map(card)}</section>}
            {items.length === 0 && recent.length === 0 && <p>{text.empty}</p>}{items.map(card)}</>;
        }}
      </CursorList> : published.length > 0 && <section aria-label={commentText[locale].justPublished}><h4>{commentText[locale].justPublished}</h4>{published.map(card)}</section>}
    </div>
  </div>;
}
