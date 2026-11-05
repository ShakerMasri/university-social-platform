"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { peopleText } from "@/i18n/people";
import { useHydrated } from "@/app/use-hydrated";

type Results = { items: { id: string; displayName: string }[]; next: string | null };
function decode(value: unknown): Results {
  if (!value || typeof value !== "object") throw new Error("Invalid people response");
  const result = value as Results;
  if (!Array.isArray(result.items) || result.items.length > 20 || !(result.next === null || (typeof result.next === "string" && /^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(result.next)))) throw new Error("Invalid people page");
  for (const item of result.items) {
    if (!item || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || typeof item.displayName !== "string" || !item.displayName.trim() || Array.from(item.displayName).length > 60) throw new Error("Invalid people item");
  }
  return result;
}
export function PeopleSearch({ locale }: { locale: Locale }) {
  const text = peopleText[locale], hydrated = useHydrated();
  const [query, setQuery] = useState(""), [result, setResult] = useState<Results | null>(null);
  const [state, setState] = useState<"initial" | "loading" | "done" | "failed">("initial"), [error, setError] = useState(text.failed);
  const pending = useRef<AbortController | null>(null), last = useRef<string | undefined>(undefined), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { const request = pending.current; pending.current = null; request?.abort(); }, []);
  useEffect(() => { if (state === "done" || state === "failed") heading.current?.focus(); }, [state, result]);
  function changed() {
    const request = pending.current; pending.current = null; request?.abort(); last.current = undefined; setResult(null); setState("initial");
  }
  async function search(after?: string) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller; last.current = after;
    setResult(null); setState("loading");
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const parameters = new URLSearchParams({ q: query }); if (after) parameters.set("after", after);
      const response = await fetch(`/api/people?${parameters}`, { cache: "no-store", signal: controller.signal });
      if (pending.current !== controller) return;
      if (!response.ok) {
        setError(response.status === 400 ? text.invalid : [401, 403, 404].includes(response.status) ? text.unavailable : response.status === 429 ? text.rate : text.failed);
        setState("failed"); return;
      }
      const page = decode(await response.json());
      if (pending.current !== controller) return;
      if (after && page.next === after) throw new Error("People cursor did not advance");
      setResult(page); setState("done");
    } catch { if (pending.current === controller) { setError(text.failed); setState("failed"); } }
    finally { clearTimeout(timeout); if (pending.current === controller) pending.current = null; }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void search(); }
  return <>
    <form className="form-panel" onSubmit={submit}>
      <label htmlFor="people-query">{text.query}</label>
      <input id="people-query" type="search" dir="auto" required minLength={2} maxLength={120} value={query} onChange={event => { changed(); setQuery(event.target.value); }} aria-describedby="people-hint" />
      <p id="people-hint" className="field-hint">{text.hint}</p>
      <button type="submit" disabled={!hydrated || state === "loading"}>{state === "loading" ? text.loading : text.submit}</button>
    </form>
    <section aria-labelledby="people-results" aria-busy={state === "loading"}>
      <h2 id="people-results" ref={heading} tabIndex={-1}>{text.results}</h2>
      {state === "initial" && <p>{text.initial}</p>}
      {state === "loading" && <p role="status">{text.loading}</p>}
      {state === "failed" && <><p role="alert">{error}</p><button onClick={() => void search(last.current)}>{text.retry}</button></>}
      {result && <>
        {result.items.length === 0 && <p role="status">{text.empty}</p>}
        <ul className="community-list">{result.items.map(item => <li className="community-card people-result" key={item.id}>
          <h3 dir="auto"><Link prefetch={false} href={`/${locale}/people/${item.id}`}><bdi>{item.displayName}</bdi></Link></h3>
        </li>)}</ul>
        {result.next && <button onClick={() => void search(result.next!)}>{text.next}</button>}
      </>}
    </section>
  </>;
}
