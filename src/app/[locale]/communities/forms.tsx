"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { communityText } from "@/i18n/communities";
import { communityInput, type MembershipAction } from "@/server/communities/policy";

async function post(path: string, data: object) {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status };
    const body = await response.json() as { id?: string };
    return { ok: true, status: response.status, id: body.id };
  } catch { return { ok: false, status: 503 }; }
}
export function CreateCommunityForm({ locale }: { locale: Locale }) {
  const text = communityText[locale], router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    const input = { name: data.get("name"), description: data.get("description"), visibility: data.get("visibility") };
    try { communityInput(input); } catch { setMessage(text.failed); feedback.current?.focus(); return; }
    setBusy(true); setMessage("");
    const result = await post("/api/communities", input);
    setBusy(false);
    if (result.ok && result.id) router.push(`/${locale}/communities/${result.id}`);
    else { setMessage(result.status === 429 ? text.rate : text.failed); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section aria-labelledby="create-heading">
    <h2 id="create-heading">{text.create}</h2>
    <p id="visibility-hint">{text.hint}</p>
    <p id="community-limits">{text.limits}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="community-name">{text.name}</label><input id="community-name" name="name" required dir="auto" aria-describedby="community-limits" />
      <label htmlFor="community-description">{text.description}</label><textarea id="community-description" name="description" dir="auto" rows={3} aria-describedby="community-limits" />
      <label htmlFor="community-visibility">{text.visibility}</label>
      <select id="community-visibility" name="visibility" aria-describedby="visibility-hint"><option value="PUBLIC">{text.public}</option><option value="PRIVATE">{text.private}</option></select>
      <button disabled={busy} type="submit">{busy ? text.busy : text.create}</button>
    </form>
    <p ref={feedback} role="status" tabIndex={-1}>{message}</p>
  </section>;
}
export function MembershipControls({ locale, id, actions, userId, visibility, membership }: { locale: Locale; id: string; actions: MembershipAction[]; userId?: string; visibility?: "PUBLIC" | "PRIVATE"; membership?: "PENDING" | "MEMBER" | null }) {
  const text = communityText[locale], router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  async function change(action: MembershipAction) {
    setBusy(true); setMessage("");
    const result = await post(`/api/communities/${id}/memberships`, { action, ...(userId ? { userId } : {}) });
    setBusy(false); setMessage(result.ok ? text.changed : result.status === 429 ? text.rate : text.failed);
    requestAnimationFrame(() => feedback.current?.focus());
    if (result.ok) router.refresh();
  }
  return <div aria-busy={busy}>
    <div className="community-actions">{actions.map((action) => <button key={action} disabled={busy} type="button" onClick={() => void change(action)}>
      {busy ? text.busy : action === "join" ? visibility === "PRIVATE" ? text.request : text.join : action === "leave" ? membership === "PENDING" ? text.cancel : text.leave : action === "approve" ? text.approve : membership === "PENDING" ? text.reject : text.remove}
      {userId && <span className="visually-hidden"> · {text.userId}: <bdi dir="ltr">{userId}</bdi></span>}
    </button>)}</div>
    <p ref={feedback} role="status" tabIndex={-1}>{message}</p>
  </div>;
}
