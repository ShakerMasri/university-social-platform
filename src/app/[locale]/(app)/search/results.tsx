import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { archiveText } from "@/i18n/archive";
import { peopleText } from "@/i18n/people";
import { postText } from "@/i18n/posts";
import { searchText } from "@/i18n/search";
import { uiText } from "@/i18n/ui";
import { postTypes, type PostType } from "@/server/posts/policy";
import { Avatar } from "@/ui/components/avatar";
import { Badge } from "@/ui/components/badge";
import { ButtonLink } from "@/ui/components/button";
import { EmptyState, ErrorState } from "@/ui/components/state";
import type { SearchFailure } from "./search-data";
import styles from "./search.module.css";

export type PostResult = {
  id: string; communityId: string; communityName: string; title: string; type: string;
  createdAt: Date; authorName: string | null; excerpt: string; commentId: string | null;
};
export type PersonResult = { id: string; displayName: string };

const typeTone = { QUESTION: "question", DISCUSSION: "discussion", RESOURCE: "resource", ANNOUNCEMENT: "announcement" } as const;
const isPostType = (value: string): value is PostType => (postTypes as readonly string[]).includes(value);

/** One matching post. Stored text renders as text only, never as markup. */
function PostCard({ locale, item, headingLevel }: { locale: Locale; item: PostResult; headingLevel: 3 | 4 }) {
  const posts = postText[locale], text = archiveText[locale];
  const Heading = `h${headingLevel}` as const;
  const href = `/${locale}/communities/${item.communityId}/posts/${item.id}${item.commentId ? `?comment=${item.commentId}` : ""}`;
  return (
    <li className={styles.card} data-search-result="post">
      <p className={styles.meta}>
        {isPostType(item.type) && <Badge tone={typeTone[item.type]}>{posts.types[item.type]}</Badge>}
        <bdi className={styles.community}>{item.communityName}</bdi>
        <span aria-hidden="true">·</span>
        <time dateTime={item.createdAt.toISOString()}>
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(item.createdAt)}
        </time>
      </p>
      <Heading className={styles.title} dir="auto">
        <Link prefetch={false} href={href}>{item.title}</Link>
      </Heading>
      <p className={styles.author}>{posts.attribution} <bdi>{item.authorName ?? posts.deleted}</bdi></p>
      <p className={styles.matchLabel}>{item.commentId ? text.commentMatch : text.postMatch}</p>
      <p className={styles.excerpt} dir="auto">{item.excerpt}</p>
    </li>
  );
}

export function PostResultList({ locale, items, headingLevel = 3 }: { locale: Locale; items: readonly PostResult[]; headingLevel?: 3 | 4 }) {
  return <ul className={styles.list}>{items.map((item) => <PostCard key={item.id} locale={locale} item={item} headingLevel={headingLevel} />)}</ul>;
}

export function PeopleResultList({ locale, items, headingLevel = 3 }: { locale: Locale; items: readonly PersonResult[]; headingLevel?: 3 | 4 }) {
  const Heading = `h${headingLevel}` as const;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={`${styles.card} ${styles.person}`} data-search-result="person">
          <Avatar name={item.displayName} seed={item.id} />
          <Heading className={styles.title} dir="auto">
            <Link prefetch={false} href={`/${locale}/people/${item.id}`}><bdi>{item.displayName}</bdi></Link>
          </Heading>
        </li>
      ))}
    </ul>
  );
}

/** Why one kind shows no results. Other kinds on the page are unaffected. */
export function KindFailure({ locale, kind, failure, paged, retryHref, headingLevel = 3 }: {
  locale: Locale; kind: "posts" | "people"; failure: SearchFailure; paged: boolean; retryHref: string; headingLevel?: 3 | 4;
}) {
  const search = searchText[locale];
  const text = kind === "posts" ? archiveText[locale] : peopleText[locale];
  if (failure === "invalid") {
    // A cursor from an old or foreign link is "start a new search", not a typo.
    const message = paged ? text.invalid : kind === "posts" ? search.postsInvalid : search.peopleInvalid;
    return <p className={styles.notice} role="status">{message}</p>;
  }
  if (failure === "unavailable") return <ErrorState tone="denied" headingLevel={headingLevel} title={text.unavailable} />;
  return (
    <ErrorState
      headingLevel={headingLevel}
      title={failure === "rate" ? text.rate : text.failed}
      action={failure === "failed" ? <ButtonLink href={retryHref} prefetch={false}>{uiText[locale].retry}</ButtonLink> : undefined}
    />
  );
}

export function KindEmpty({ locale, kind, headingLevel = 3 }: { locale: Locale; kind: "posts" | "people"; headingLevel?: 3 | 4 }) {
  if (kind === "posts") return <EmptyState headingLevel={headingLevel} title={archiveText[locale].empty} />;
  return (
    <EmptyState
      headingLevel={headingLevel}
      title={peopleText[locale].empty}
      action={<ButtonLink href={`/${locale}/profile`}>{peopleText[locale].settings}</ButtonLink>}
    />
  );
}
