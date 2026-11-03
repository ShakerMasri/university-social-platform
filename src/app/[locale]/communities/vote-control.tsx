"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { voteText } from "@/i18n/votes";
import { voteSummary, type VoteSummary, type VoteValue } from "@/server/votes/policy";
import { useHydrated } from "@/app/use-hydrated";
import { VoteIcon } from "./action-icons";

export function VoteControl({ initial, endpoint, locale }: { initial: VoteSummary; endpoint: string; locale: Locale }) {
  const router = useRouter(), hydrated = useHydrated(), text = voteText[locale];
  const controlId = useId();
  const [source, setSource] = useState(initial), [vote, setVote] = useState(initial);
  const [busy, setBusy] = useState(false), [desired, setDesired] = useState<VoteValue | null>(null), [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false), pending = useRef<AbortController | null>(null);
  if (source !== initial) { setSource(initial); setVote(initial); setBusy(false); setDesired(null); setMessage(""); setUnavailable(false); }
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [initial, endpoint]);

  async function submit(value: VoteValue) {
    if (pending.current || !vote.canVote || unavailable) return;
    const controller = new AbortController();
    pending.current = controller; setDesired(value); setBusy(true); setMessage("");
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }), cache: "no-store", signal: controller.signal });
      if (pending.current !== controller) return;
      if ([401, 403, 404].includes(response.status)) {
        setUnavailable(true); setMessage(text.unavailable); router.refresh(); return;
      }
      if (!response.ok) { setMessage(response.status === 429 ? text.rate : text.failed); return; }
      const result = voteSummary(await response.json());
      if (pending.current !== controller) return;
      if (result.value !== value) throw new Error("Unconfirmed vote state");
      setVote(result); setDesired(null); setMessage(value === 1 ? text.saved : value === -1 ? text.downSaved : text.removed);
    } catch { if (pending.current === controller) setMessage(text.failed); }
    finally { clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }

  return <div className="vote-control" role="group" aria-label={text.group} aria-busy={busy} title={!vote.canVote ? text.hint : undefined}>
    {!unavailable && <>
      <button className="action-icon" type="button" disabled={!hydrated || busy || !vote.canVote} aria-label={text.add} aria-describedby={`${controlId}-upvotes`} title={vote.value === 1 ? text.remove : text.add} aria-pressed={vote.value === 1} onClick={() => void submit(vote.value === 1 ? 0 : 1)}><VoteIcon direction="up" selected={vote.value === 1} /><span className="vote-count vote-up-count" id={`${controlId}-upvotes`}><span className="visually-hidden">{text.upvotes}: </span><bdi>{vote.upvotes.toLocaleString(locale)}</bdi></span></button>
      <button className="action-icon" type="button" disabled={!hydrated || busy || !vote.canVote} aria-label={text.down} aria-describedby={`${controlId}-downvotes`} title={vote.value === -1 ? text.removeDown : text.down} aria-pressed={vote.value === -1} onClick={() => void submit(vote.value === -1 ? 0 : -1)}><VoteIcon direction="down" selected={vote.value === -1} /><span className="vote-count vote-down-count" id={`${controlId}-downvotes`}><span className="visually-hidden">{text.downvotes}: </span><bdi>{vote.downvotes.toLocaleString(locale)}</bdi></span></button>
      {desired !== null && !busy && <button className="text-action" type="button" onClick={() => void submit(desired)}>{text.retry}</button>}
    </>}
    <p aria-live="polite">{message}</p>
  </div>;
}
