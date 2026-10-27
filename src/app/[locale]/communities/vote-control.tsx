"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { voteText } from "@/i18n/votes";
import { voteSummary, type VoteSummary } from "@/server/votes/policy";
import { useHydrated } from "@/app/use-hydrated";

export function VoteControl({ initial, endpoint, locale }: { initial: VoteSummary; endpoint: string; locale: Locale }) {
  const router = useRouter(), hydrated = useHydrated(), text = voteText[locale];
  const [source, setSource] = useState(initial), [vote, setVote] = useState(initial);
  const [busy, setBusy] = useState(false), [desired, setDesired] = useState<boolean | null>(null), [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false), pending = useRef<AbortController | null>(null);
  if (source !== initial) { setSource(initial); setVote(initial); setBusy(false); setDesired(null); setMessage(""); setUnavailable(false); }
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [initial, endpoint]);

  async function submit() {
    if (pending.current || !vote.canVote || unavailable) return;
    const active = desired ?? !vote.active, controller = new AbortController();
    pending.current = controller; setDesired(active); setBusy(true); setMessage("");
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }), cache: "no-store", signal: controller.signal });
      if (pending.current !== controller) return;
      if ([401, 403, 404].includes(response.status)) {
        setUnavailable(true); setMessage(text.unavailable); router.refresh(); return;
      }
      if (!response.ok) { setMessage(response.status === 429 ? text.rate : text.failed); return; }
      const result = voteSummary(await response.json());
      if (pending.current !== controller) return;
      if (result.active !== active) throw new Error("Unconfirmed vote state");
      setVote(result); setDesired(null); setMessage(active ? text.saved : text.removed);
    } catch { if (pending.current === controller) setMessage(text.failed); }
    finally { clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }

  return <div role="group" aria-label={text.group} aria-busy={busy}>
    {!unavailable && <>
      <p>{text.count}: <bdi>{vote.count.toLocaleString(locale)}</bdi></p>
      {vote.canVote ? <button type="button" disabled={!hydrated || busy} aria-pressed={vote.active} onClick={() => void submit()}>
        {busy ? text.busy : desired !== null ? text.retry : vote.active ? text.remove : text.add}
      </button> : <p>{text.hint}</p>}
    </>}
    <p aria-live="polite">{message}</p>
  </div>;
}
