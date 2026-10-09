"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { capturePendingConfirmation, clearPendingConfirmation, pendingConfirmationToken } from "./pending-confirmation";

async function post(operation: string, data: object) {
  try {
    const response = await fetch(`/api/identity/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    return { ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 503 }; }
}

function useFeedback() {
  const [message, setMessage] = useState("");
  const show = (value: string) => { setMessage(value); requestAnimationFrame(() => document.getElementById("identity-feedback")?.focus()); };
  return { message, show };
}

export function SignInForm({ locale }: { locale: Locale }) {
  const text = identityText[locale];
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const result = await post("request", { email, locale });
    setBusy(false); feedback.show(result.ok ? text.requested : text.failed);
  }
  return <>
    <h1>{text.signIn}</h1><p id="email-hint">{text.hint}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="email">{text.email}</label>
      <input id="email" name="email" type="text" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required aria-describedby="email-hint" />
      <button disabled={busy} type="submit">{busy ? text.busy : text.request}</button>
    </form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
  </>;
}

export function ConfirmationForm({ locale }: { locale: Locale }) {
  const text = identityText[locale];
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  useEffect(() => {
    const capture = () => {
      const fragment = window.location.hash.slice(1);
      if (fragment) capturePendingConfirmation(fragment);
      // Also handle a second link opened while already on this page. Fragment
      // navigation does not remount the component or run the initial effect.
      window.history.replaceState(null, "", window.location.pathname);
    };
    capture();
    window.addEventListener("hashchange", capture);
    window.addEventListener("pagehide", clearPendingConfirmation);
    return () => {
      window.removeEventListener("hashchange", capture);
      window.removeEventListener("pagehide", clearPendingConfirmation);
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const result = await post("confirm", { token: pendingConfirmationToken(), locale });
    setBusy(false);
    if (result.ok || result.status === 400) clearPendingConfirmation();
    if (result.ok) window.location.assign(`/${locale}/profile`);
    else feedback.show(text.linkError);
  }
  return <>
    <h1>{text.confirm}</h1><p>{text.confirmHint}</p>
    <form onSubmit={submit} aria-busy={busy}><button disabled={busy} type="submit">{busy ? text.busy : text.confirm}</button></form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
    <p><Link href={`/${locale}/signin`} onClick={clearPendingConfirmation}>{text.request}</Link></p>
  </>;
}

export function ProfileForm({ locale, profile }: { locale: Locale; profile: { email: string; displayName: string | null } }) {
  const text = identityText[locale];
  const [name, setName] = useState(profile.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const result = await post("profile", { displayName: name });
    setBusy(false);
    if (result.status === 401) window.location.assign(`/${locale}/signin`);
    else feedback.show(result.ok ? text.saved : result.status === 400 ? text.invalidName : text.failed);
  }
  async function endSession() {
    setBusy(true);
    const result = await post("logout", {});
    setBusy(false);
    if (result.ok) window.location.assign(`/${locale}/signin`); else feedback.show(text.failed);
  }
  return <>
    <h1>{text.profile}</h1><p>{text.email}: <bdi dir="ltr">{profile.email}</bdi></p><p>{text.private}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="display-name">{text.name}</label>
      <input id="display-name" name="displayName" dir="auto" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} required aria-describedby="name-hint" />
      <p id="name-hint">{text.nameHint}</p>
      <button disabled={busy} type="submit">{busy ? text.busy : text.save}</button>
    </form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
    <button disabled={busy} type="button" onClick={endSession}>{text.logout}</button>
  </>;
}
