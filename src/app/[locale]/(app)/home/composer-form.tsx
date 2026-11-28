"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { homeText } from "@/i18n/home";
import { postText } from "@/i18n/posts";
import { postInput, postTypes, type PostType } from "@/server/posts/policy";
import { useHydrated } from "@/app/use-hydrated";
import { Button, ButtonLink } from "@/ui/components/button";
import { ChoiceChips, type ChipTone } from "@/ui/components/chip";
import { Select, TextField } from "@/ui/components/field";
import { ErrorState } from "@/ui/components/state";
import { filterCommunities, memberCommunitiesResponse, pickerSearchThreshold, sortCommunities, type MemberCommunity } from "./member-communities";
import styles from "./home.module.css";

// The open composer, loaded on first use (or when "Start a post" is hovered
// or focused) so Home carries only the collapsed card.
const requestTimeoutMs = 15_000;
const typeTone: Record<PostType, ChipTone> = { QUESTION: "question", DISCUSSION: "discussion", RESOURCE: "resource", ANNOUNCEMENT: "announcement" };
type Communities =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "session" }
  | { status: "ready"; items: MemberCommunity[] };

export default function ComposerForm({ locale, initialType, onClose }: { locale: Locale; initialType: PostType; onClose: () => void }) {
  const text = homeText[locale], posts = postText[locale], router = useRouter(), hydrated = useHydrated();
  const [communities, setCommunities] = useState<Communities>({ status: "loading" });
  const [query, setQuery] = useState(""), [selected, setSelected] = useState("");
  const [type, setType] = useState<PostType>(initialType);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  // After a failure whose outcome is unknown (no answer, a server error), the
  // post may already exist in the chosen community. The retry key covers only
  // that community, so the choice stays locked until the user cancels.
  const [uncertain, setUncertain] = useState(false);
  const requestId = useRef<string | null>(null), feedback = useRef<HTMLParagraphElement>(null);
  const firstField = useRef<HTMLDivElement>(null), loading = useRef<AbortController | null>(null);
  const selectId = useId();

  // In the background (after a refused post) the form and its message stay;
  // only the list is replaced, and a failure keeps the current one.
  const fetchCommunities = useCallback(async (background: boolean) => {
    loading.current?.abort();
    const controller = new AbortController(); loading.current = controller;
    try {
      const response = await fetch("/api/communities/mine", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]) });
      if (loading.current !== controller) return;
      if (response.status === 401 || response.status === 403) { setCommunities({ status: "session" }); return; }
      if (!response.ok) throw new Error("Communities unavailable");
      const items = sortCommunities(memberCommunitiesResponse(await response.json()), locale);
      if (loading.current !== controller) return;
      setCommunities({ status: "ready", items });
      setSelected(current => items.some(item => item.id === current) ? current : "");
    } catch {
      if (loading.current === controller && !background) setCommunities({ status: "failed" });
    }
  }, [locale]);
  const load = useCallback((background = false) => {
    if (!background) setCommunities({ status: "loading" });
    return fetchCommunities(background);
  }, [fetchCommunities]);
  useEffect(() => {
    // The form mounts in its loading state; start the request after this effect.
    let active = true;
    queueMicrotask(() => { if (active) void fetchCommunities(false); });
    return () => { active = false; loading.current?.abort(); loading.current = null; };
  }, [fetchCommunities]);
  // Focus the first field once the picker (or the state that replaced it)
  // first appears, and again after a Retry; never while the user is working.
  const focusPending = useRef(true);
  useEffect(() => {
    if (communities.status === "loading") { focusPending.current = true; return; }
    if (!focusPending.current) return;
    focusPending.current = false;
    firstField.current?.querySelector<HTMLElement>("input, select, button, a")?.focus();
  }, [communities.status]);

  const items = useMemo(() => communities.status === "ready" ? communities.items : [], [communities]);
  const community = items.find(item => item.id === selected);
  const searchable = items.length > pickerSearchThreshold;
  const matches = useMemo(() => searchable ? filterCommunities(items, query) : items, [items, query, searchable]);
  // Keep the chosen community listed while the search hides it (not counted as a match).
  const visible = community && !matches.includes(community) ? [community, ...matches] : matches;
  const types = postTypes.filter(value => value !== "ANNOUNCEMENT" || community?.isOwner);

  function choose(id: string) {
    setSelected(id);
    const next = items.find(item => item.id === id);
    if (type === "ANNOUNCEMENT" && !next?.isOwner) setType("QUESTION");
  }
  function notify(value: string) { setMessage(value); requestAnimationFrame(() => feedback.current?.focus()); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    if (!community) { notify(text.chooseCommunity); return; }
    requestId.current ??= crypto.randomUUID();
    const input = { requestId: requestId.current, type, title: data.get("title"), body: data.get("body"), ...(type === "RESOURCE" ? { resourceUrl: data.get("resourceUrl") } : {}) };
    try { postInput(input); } catch { notify(posts.invalid); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/communities/${community.id}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
      if (!response.ok) {
        if (response.status >= 500) { setUncertain(true); notify(text.uncertain); return; }
        // Any other refusal means nothing was published.
        setUncertain(false);
        if (response.status === 409) requestId.current = null;
        if (response.status === 401) { setCommunities({ status: "session" }); return; }
        if (response.status === 403 || response.status === 404) { notify(text.noAccess); void load(true); return; }
        notify(response.status === 429 ? posts.rate : response.status === 409 ? posts.conflict : posts.failed);
        return;
      }
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id)) { setUncertain(true); notify(text.uncertain); return; }
      // Keep the retry key until unmount: a second click during navigation
      // must resolve to this post, not create a duplicate.
      router.push(`/${locale}/communities/${community.id}/posts/${result.id}`);
    } catch { setUncertain(true); notify(text.uncertain); }
    finally { setBusy(false); }
  }

  const cancel = <Button variant="ghost" onClick={onClose}>{text.cancel}</Button>;
  if (communities.status === "loading") {
    return <div className={styles.composerState}><p role="status">{text.loadingCommunities}</p>{cancel}</div>;
  }
  if (communities.status !== "ready" || items.length === 0) {
    const state = communities.status === "failed"
      ? <ErrorState announce headingLevel={3} title={text.communitiesFailed} action={<Button variant="secondary" onClick={() => void load()}>{text.retry}</Button>} />
      : communities.status === "session"
        ? <ErrorState announce tone="denied" headingLevel={3} title={text.sessionChanged} action={<a href={`/${locale}`}>{text.reload}</a>} />
        : <div role="status"><p className={styles.composerNote}>{text.noCommunities}</p><p><ButtonLink href={`/${locale}/communities`} prefetch={false}>{text.explore}</ButtonLink></p></div>;
    return <div ref={firstField} className={styles.composerState}>{state}{cancel}</div>;
  }
  return (
    <form className={styles.composerForm} onSubmit={submit} aria-busy={busy}>
      <div ref={firstField} className={styles.picker}>
        {searchable && <>
          <TextField label={text.findCommunity} hint={text.findCommunityHint} type="search" value={query} autoComplete="off"
            onChange={event => setQuery(event.target.value)} aria-controls={selectId} disabled={!hydrated || uncertain} />
          <p role="status" className={styles.pickerStatus}>
            {query.trim() ? (matches.length ? text.matches.replace("{count}", matches.length.toLocaleString(locale)) : text.noMatch) : ""}
          </p>
        </>}
        <Select id={selectId} label={text.community} name="community" required value={selected} disabled={!hydrated || busy || uncertain}
          onChange={event => choose(event.target.value)}
          options={[{ value: "", label: text.chooseCommunity }, ...visible.map(item => ({ value: item.id, label: item.visibility === "PRIVATE" ? `${item.name} (${text.privateCommunity})` : item.name }))]} />
      </div>
      <ChoiceChips legend={posts.type} name="type" value={type} onChange={setType}
        options={types.map(value => ({ value, label: posts.types[value], tone: typeTone[value], disabled: !hydrated || busy }))} />
      {community && !community.isOwner && <p className={styles.composerHint}>{text.announcementHint}</p>}
      <TextField label={posts.postTitle} name="title" required dir="auto" maxLength={160} disabled={!hydrated || busy} />
      <TextField label={posts.body} name="body" multiline rows={5} required dir="auto" maxLength={10_000} hint={posts.limits} disabled={!hydrated || busy} />
      {type === "RESOURCE" && <TextField label={posts.link} name="resourceUrl" type="url" dir="ltr" maxLength={2048} hint={posts.linkHint} disabled={!hydrated || busy} />}
      <p ref={feedback} role="status" tabIndex={-1} className={styles.composerFeedback}>{message}</p>
      <div className={styles.composerActions}>
        {cancel}
        <Button type="submit" pending={busy} disabled={!hydrated}>{busy ? posts.busy : posts.publish}</Button>
      </div>
    </form>
  );
}
