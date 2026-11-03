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

export function CommentThread({ locale, comment, communityId, postId, authorization, initialReplies, recentlyPublished = false }: { locale: Locale; comment: CommentItem; communityId: string; postId: string; authorization: { canComment: boolean }; initialReplies?: ContentPage<CommentItem>; recentlyPublished?: boolean }) {
  const text = replyText[locale], hydrated = useHydrated(), router = useRouter(), composer = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<CommentItem | null>(null), [page, setPage] = useState<ContentPage<CommentItem> | null>(initialReplies ?? null);
  const [draftTargets, setDraftTargets] = useState<{ comment: CommentItem; generation: number }[]>([]);
  const publicationGeneration = useRef(0);
  // Only a fresh server authorization snapshot can restore Reply eligibility.
  // Growing the local reply/root pages cannot undo an explicit denial.
  const [access, setAccess] = useState({ authorization, denied: false });
  if (access.authorization !== authorization) setAccess({ authorization, denied: false });
  const canReply = authorization.canComment && !access.denied;
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle"), [published, setPublished] = useState<CommentItem[]>([]);
  const endpoint = `/api/communities/${communityId}/posts/${postId}/comments/${comment.id}/replies`;
  useEffect(() => { if (target) composer.current?.querySelector("textarea")?.focus(); }, [target]);
  function reply(item: CommentItem) {
    if (!canReply) return;
    // Keep each visited composer mounted in memory, including its draft,
    // in-flight submission and ambiguous-write retry key for this addressee.
    const generation = publicationGeneration.current;
    setDraftTargets(previous => previous.some(row => row.comment.id === item.id) ? previous : [...previous, { comment: item, generation }]);
    if (target?.id === item.id) composer.current?.querySelector("textarea")?.focus();
    setTarget(item);
  }
  function invalidateAccess() {
    // A cleared/unmounted composer can still receive a confirmed write result.
    publicationGeneration.current += 1; setAccess(previous => ({ ...previous, denied: true }));
    setPage(null); setPublished([]); setTarget(null); setDraftTargets([]); setState("failed");
  }
  async function load() {
    if (state === "loading") return;
    const generation = publicationGeneration.current;
    setState("loading");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (publicationGeneration.current !== generation) return;
      if ([401, 403, 404].includes(response.status)) {
        invalidateAccess(); router.refresh(); return;
      }
      if (!response.ok) throw new Error("Unavailable replies");
      const result = commentPageResponse(await response.json());
      if (publicationGeneration.current !== generation) return;
      setPage(result); setState("idle");
    } catch {
      // A failed read does not undo a confirmed write or discard an unsent draft.
      // Only an explicit access denial above invalidates that local content.
      if (publicationGeneration.current === generation) setState("failed");
    }
  }
  const card = (item: CommentItem) => <CommentCard key={item.id} locale={locale} comment={item} communityId={communityId} postId={postId} onReply={canReply && hydrated ? reply : undefined} />;
  return <div role={recentlyPublished ? "region" : undefined} aria-label={recentlyPublished ? commentText[locale].justPublished : undefined}>
    {recentlyPublished && <h3>{commentText[locale].justPublished}</h3>}
    {card(comment)}
    {(comment.replyCount > 0 || Boolean(target) || Boolean(page) || published.length > 0 || state === "failed") && <div className="comment-replies">
      {initialReplies && <button className="text-action" type="button" disabled={!hydrated || state === "loading"} onClick={() => void load()}>{text.first}</button>}
      {canReply && draftTargets.map(({ comment: item, generation }) => <div key={item.id} hidden={target?.id !== item.id} ref={target?.id === item.id ? composer : undefined}>
        <div className="reply-composer-header"><p>{text.replyingTo}: <bdi>{item.authorName ?? postText[locale].deleted}</bdi></p>
        <button className="text-action" type="button" onClick={() => {
          // Explicit cancellation discards this target's composer; switching does not.
          setDraftTargets(previous => previous.filter(row => row.comment.id !== item.id));
          setTarget(null); document.getElementById(`comment-${comment.id}`)?.focus();
        }}>{text.cancel}</button></div>
        <CommentForm locale={locale} communityId={communityId} postId={postId} replyToId={item.id} onPublished={item => {
          if (publicationGeneration.current !== generation) return;
          setPublished(previous => [...previous.filter(row => row.id !== item.id), item]);
        }} />
      </div>)}
      {!page && (comment.replyCount > 0 || published.length > 0 || state === "failed") && <button className="text-action" type="button" disabled={!hydrated || state === "loading"} onClick={() => void load()}>{state === "loading" ? text.loading : text.show}</button>}
      {state === "failed" && <p role="alert">{text.failed}</p>}
      {page ? <CursorList initial={page} endpoint={endpoint} parsePage={commentPageResponse} locale={locale} moreLabel={text.more} itemPrefix="comment" automatic={false} buttonClassName="text-action" onAccessDenied={invalidateAccess}>
        {items => {
          const recent = published.filter(row => !items.some(item => item.id === row.id));
          return <>{recent.length > 0 && <section aria-label={commentText[locale].justPublished}><h4>{commentText[locale].justPublished}</h4>{recent.map(card)}</section>}
            {items.length === 0 && recent.length === 0 && <p>{text.empty}</p>}{items.map(card)}</>;
        }}
      </CursorList> : published.length > 0 && <section aria-label={commentText[locale].justPublished}><h4>{commentText[locale].justPublished}</h4>{published.map(card)}</section>}
    </div>}
  </div>;
}
