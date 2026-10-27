"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import { postInput, postTypes, type PostType } from "@/server/posts/policy";
import { useHydrated } from "@/app/use-hydrated";

export function CreatePostForm({ locale, communityId, canAnnounce }: { locale: Locale; communityId: string; canAnnounce: boolean }) {
  const hydrated = useHydrated();
  const text = postText[locale], router = useRouter();
  const [type, setType] = useState<PostType>("QUESTION"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null), requestId = useRef<string | null>(null);
  function notify(value: string) { setMessage(value); requestAnimationFrame(() => feedback.current?.focus()); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    const input = { requestId: requestId.current, type, title: data.get("title"), body: data.get("body"), ...(type === "RESOURCE" ? { resourceUrl: data.get("resourceUrl") } : {}) };
    try { postInput(input); } catch { notify(text.invalid); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/communities/${communityId}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
      if (!response.ok) {
        if (response.status === 409) requestId.current = null;
        notify(response.status === 429 ? text.rate : response.status === 409 ? text.conflict : text.failed);
        return;
      }
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id)) { notify(text.failed); return; }
      // Keep the retry key until unmount: a second click during navigation
      // must resolve to this post, not create a duplicate.
      router.push(`/${locale}/communities/${communityId}/posts/${result.id}`);
    } catch { notify(text.failed); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="create-post-heading">
    <h2 id="create-post-heading">{text.create}</h2><p id="post-limits">{text.limits}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="post-type">{text.type}</label>
      <select id="post-type" name="type" value={type} disabled={busy || !hydrated} onChange={event => setType(event.target.value as PostType)}>
        {postTypes.filter(value => canAnnounce || value !== "ANNOUNCEMENT").map(value => <option key={value} value={value}>{text.types[value]}</option>)}
      </select>
      <label htmlFor="post-title">{text.postTitle}</label><input id="post-title" name="title" required dir="auto" disabled={busy || !hydrated} aria-describedby="post-limits" />
      <label htmlFor="post-body">{text.body}</label><textarea id="post-body" name="body" rows={6} required dir="auto" disabled={busy || !hydrated} aria-describedby="post-limits" />
      {type === "RESOURCE" && <><label htmlFor="post-link">{text.link}</label><input id="post-link" name="resourceUrl" type="url" dir="ltr" disabled={busy || !hydrated} aria-describedby="post-link-hint post-limits" /><p id="post-link-hint">{text.linkHint}</p></>}
      <button type="submit" disabled={busy || !hydrated}>{busy ? text.busy : text.publish}</button>
    </form><p ref={feedback} role="status" tabIndex={-1}>{message}</p>
  </section>;
}
