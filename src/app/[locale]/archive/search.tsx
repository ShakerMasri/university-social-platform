"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { archiveText } from "@/i18n/archive";
import { postText } from "@/i18n/posts";
import { postTypes } from "@/server/posts/policy";
import { useHydrated } from "@/app/use-hydrated";

type Item = { id: string; communityId: string; communityName: string; title: string; type: typeof postTypes[number]; createdAt: string;
  authorName: string | null; excerpt: string; commentId: string | null };
type Page = { items: Item[]; next: string | null; interrupted: boolean };
function decode(value: unknown): Page {
  if (!value || typeof value !== "object") throw new Error("Invalid search response");
  const page = value as Page;
  if (!Array.isArray(page.items) || page.items.length > 20 || typeof page.interrupted !== "boolean" || !(page.next === null || (typeof page.next === "string" && /^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(page.next)))) throw new Error("Invalid search page");
  for (const item of page.items) {
    if (!item || typeof item !== "object" || ![item.id, item.communityId].every(id => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)) ||
      ![item.title, item.communityName, item.excerpt, item.createdAt].every(text => typeof text === "string") ||
      Array.from(item.excerpt).length > 240 || !Number.isFinite(Date.parse(item.createdAt)) || !postTypes.includes(item.type) ||
      !(item.authorName === null || typeof item.authorName === "string") || !(item.commentId === null || (typeof item.commentId === "string" && /^[0-9a-f-]{36}$/.test(item.commentId)))) throw new Error("Invalid search item");
  }
  return page;
}
export function ArchiveSearch({ locale, communities, moreCommunities, selected }: { locale: Locale; communities: { id: string; name: string }[]; moreCommunities: boolean; selected?: string }) {
  const text = archiveText[locale], posts = postText[locale];
  const hydrated = useHydrated();
  const [query, setQuery] = useState(""), [community, setCommunity] = useState(selected ?? ""), [type, setType] = useState("");
  const [page, setPage] = useState<Page | null>(null), [state, setState] = useState<"initial" | "loading" | "done" | "failed">("initial");
  const [error, setError] = useState(text.failed);
  const pending = useRef<AbortController | null>(null), last = useRef<string | undefined>(undefined), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => {
    const request = pending.current; pending.current = null; request?.abort();
  }, []);
  useEffect(() => { if (state === "done" || state === "failed") heading.current?.focus(); }, [state, page]);
  function changed() {
    pending.current?.abort(); pending.current = null; last.current = undefined; setPage(null); setState("initial");
  }
  async function search(after?: string) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller; last.current = after;
    setPage(null); setState("loading");
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const params = new URLSearchParams({ q: query });
      if (community) params.set("community", community);
      if (type) params.set("type", type);
      if (after) params.set("after", after);
      const response = await fetch(`/api/archive?${params}`, { cache: "no-store", signal: controller.signal });
      if (pending.current !== controller) return;
      if (!response.ok) {
        setError(response.status === 400 ? text.invalid : [401, 403, 404].includes(response.status) ? text.unavailable : response.status === 429 ? text.rate : text.failed);
        setState("failed"); return;
      }
      const result = decode(await response.json());
      if (pending.current !== controller) return;
      if (after && result.next === after) throw new Error("Search cursor did not advance");
      setPage(result); setState("done");
    } catch { if (pending.current === controller) { setError(text.failed); setState("failed"); } }
    finally { clearTimeout(timeout); if (pending.current === controller) pending.current = null; }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void search(); }
  return <>
    <form className="form-panel archive-form" onSubmit={submit}>
      <label htmlFor="archive-query">{text.query}</label>
      <input id="archive-query" name="q" type="search" dir="auto" required minLength={2} maxLength={400} value={query} aria-describedby="archive-hint" onChange={event => { changed(); setQuery(event.target.value); }} />
      <p id="archive-hint" className="field-hint">{text.hint}</p>
      <label htmlFor="archive-community">{text.community}</label>
      <select id="archive-community" value={community} onChange={event => { changed(); setCommunity(event.target.value); }}>
        <option value="">{text.allCommunities}</option>{communities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {moreCommunities && <p>{text.moreCommunities} <Link href={`/${locale}/communities`}>{text.community}</Link></p>}
      <label htmlFor="archive-type">{posts.type}</label>
      <select id="archive-type" value={type} onChange={event => { changed(); setType(event.target.value); }}><option value="">{text.allTypes}</option>{postTypes.map(value => <option key={value} value={value}>{posts.types[value]}</option>)}</select>
      <button type="submit" disabled={!hydrated || state === "loading"}>{state === "loading" ? text.loading : text.submit}</button>
    </form>
    <section aria-labelledby="archive-results" aria-busy={state === "loading"}>
      <h2 id="archive-results" ref={heading} tabIndex={-1}>{text.results}</h2>
      {state === "initial" && <p>{text.initial}</p>}
      {state === "loading" && <p role="status">{text.loading}</p>}
      {state === "failed" && <><p role="alert">{error}</p><button type="button" onClick={() => void search(last.current)}>{text.retry}</button></>}
      {page && <>
        {page.interrupted && <p role="status">{text.interrupted}</p>}
        {page.items.length === 0 && <p role="status">{text.empty}</p>}
        <ul className="community-list">{page.items.map(item => <li key={item.id} className="community-card archive-result">
          <p className="card-meta"><bdi>{item.communityName}</bdi><span>{posts.types[item.type]}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.createdAt))}</time></p>
          <h3 dir="auto"><Link prefetch={false} href={`/${locale}/communities/${item.communityId}/posts/${item.id}${item.commentId ? `?comment=${item.commentId}` : ""}`}>{item.title}</Link></h3>
          <p>{posts.attribution} <bdi>{item.authorName ?? posts.deleted}</bdi></p>
          <p className="field-hint">{item.commentId ? text.commentMatch : text.postMatch}</p><p dir="auto" className="archive-excerpt">{item.excerpt}</p>
        </li>)}</ul>
        {page.next && <button type="button" onClick={() => void search(page.next!)}>{text.next}</button>}
      </>}
    </section>
  </>;
}
