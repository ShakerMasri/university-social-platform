import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import type { PostType } from "@/server/posts/policy";
import { Avatar } from "@/ui/components/avatar";
import { Badge, type BadgeTone } from "@/ui/components/badge";
import { excerpt } from "@/ui/excerpt";
import { VoteControl } from "./vote-control";
import type { PostItem } from "./content-data";
import styles from "./post-summary-card.module.css";

const typeTone: Record<PostType, BadgeTone> = {
  QUESTION: "question", DISCUSSION: "discussion", RESOURCE: "resource", ANNOUNCEMENT: "announcement",
};

/**
 * A post in a list (Home feed; community pages in a later part): who wrote
 * it, where and when, its type, title and a short excerpt, then the actions.
 * The title is the link to the post. Replies, save and share join the action
 * row in Stage 3; the vote control stays as it is until then.
 */
export function PostSummaryCard({ locale, post, community, note }: {
  locale: Locale;
  post: PostItem;
  /** Shown as "in <community>" when the list mixes communities. */
  community?: { id: string; name: string };
  /** A short line above the card, such as why the post is recommended. */
  note?: string;
}) {
  const text = postText[locale];
  const author = post.authorName ?? text.deleted;
  const titleId = `post-title-${post.id}`;
  const href = `/${locale}/communities/${post.communityId}/posts/${post.id}`;
  return (
    <article className={styles.card} id={`post-${post.id}`} aria-labelledby={titleId}>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.header}>
        {/* No author id is sent with posts, so the name picks the color. */}
        <Avatar name={author} seed={author} />
        <div className={styles.byline}>
          <bdi className={styles.author}>{author}</bdi>
          <p className={styles.meta}>
            {community && <>{text.inCommunity} <Link prefetch={false} href={`/${locale}/communities/${community.id}`}><bdi>{community.name}</bdi></Link> · </>}
            <time dateTime={post.createdAt.toISOString()}>{post.createdAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</time>
          </p>
        </div>
        <Badge tone={typeTone[post.type]} className={styles.type}>{text.types[post.type]}</Badge>
      </div>
      <h3 id={titleId} className={styles.title}>
        <Link prefetch={false} href={href}><bdi>{post.title}</bdi></Link>
      </h3>
      <p dir="auto" className={styles.excerpt}>{excerpt(post.body)}</p>
      {post.resourceUrl && (
        <p className={styles.resource}>
          <span>{text.resource}: </span>
          <a href={post.resourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{post.resourceUrl}</a>
        </p>
      )}
      <div className={styles.actions}>
        <VoteControl initial={post.vote} endpoint={`/api/communities/${post.communityId}/posts/${post.id}/vote`} locale={locale} />
      </div>
    </article>
  );
}
