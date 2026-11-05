"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { peopleText } from "@/i18n/people";
import { capturePendingConfirmation, clearPendingConfirmation, pendingConfirmationToken } from "./pending-confirmation";
import { useHydrated } from "@/app/use-hydrated";

async function post(operation: string, data: object) {
  try {
    const response = await fetch(`/api/identity/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    return { ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 503 }; }
}

function useFeedback() {
  const [message, setMessage] = useState("");
  const show = (value: string) => { setMessage(value); requestAnimationFrame(() => document.getElementById("identity-feedback")?.focus()); };
  return { message, show, clear: () => setMessage("") };
}

function SyntheticEmailHint({ text }: { text: string }) {
  // This fixed local-test identifier is translated as surrounding prose, but
  // must retain its character order inside an Arabic paragraph.
  const suffix = "@university.test";
  return text.split(suffix).map((segment, index) => <Fragment key={index}>
    {index > 0 && <bdi dir="ltr">{suffix}</bdi>}{segment}
  </Fragment>);
}

export function SignInForm({ locale, preview = false }: { locale: Locale; preview?: boolean }) {
  const hydrated = useHydrated();
  const text = identityText[locale];
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const result = await post("request", { email, locale });
    setBusy(false); setRequested(result.ok); feedback.show(result.ok ? text.requested : text.failed);
  }
  async function openPreviewConfirmation() {
    setBusy(true);
    try {
      const response = await fetch("/__local-preview/confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), cache: "no-store" });
      const message = await response.json() as { token?: unknown };
      if (!response.ok || typeof message.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(message.token)) { feedback.show(text.linkError); return; }
      window.location.assign(`/${locale}/verify#${message.token}`);
    } catch { feedback.show(text.failed); }
    finally { setBusy(false); }
  }
  return <>
    <h1>{text.signIn}</h1><p id="email-hint"><SyntheticEmailHint text={text.hint} /></p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="email">{text.email}</label>
      <input disabled={!hydrated} id="email" name="email" type="text" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => { setEmail(event.target.value); setRequested(false); }} required aria-describedby="email-hint" />
      <button disabled={busy || !hydrated} type="submit">{busy ? text.busy : text.request}</button>
    </form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
    {preview && <p><SyntheticEmailHint text={text.previewHint} /></p>}
    {preview && requested && <button type="button" disabled={busy || !hydrated} onClick={() => void openPreviewConfirmation()}>{text.previewOpen}</button>}
  </>;
}

export function ConfirmationForm({ locale }: { locale: Locale }) {
  const hydrated = useHydrated();
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
    <form onSubmit={submit} aria-busy={busy}><button disabled={busy || !hydrated} type="submit">{busy ? text.busy : text.confirm}</button></form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
    <p><Link href={`/${locale}/signin`} onClick={clearPendingConfirmation}>{text.request}</Link></p>
  </>;
}

export function ProfileForm({ locale, profile }: { locale: Locale; profile: { email: string; displayName: string | null; directoryVisible: boolean; suggestion: string } }) {
  const hydrated = useHydrated();
  const text = identityText[locale];
  const people = peopleText[locale];
  const [name, setName] = useState(profile.displayName ?? `${people.suggestion} ${profile.suggestion}`);
  const [visible, setVisible] = useState(profile.directoryVisible);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { const request = pending.current; pending.current = null; request?.abort(); }, []);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function submit(event: FormEvent) {
    event.preventDefault(); feedback.clear(); setBusy(true);
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let result = { ok: false, status: 503 };
    try {
      const response = await fetch("/api/people/profile", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, directoryVisible: visible }), cache: "no-store", signal: controller.signal });
      result = { ok: response.ok, status: response.status };
    } catch { /* Keep the draft for an explicit retry; no persistence is claimed. */ }
    finally { clearTimeout(timeout); }
    if (pending.current !== controller) return;
    pending.current = null;
    setBusy(false);
    if (result.status === 401) window.location.assign(`/${locale}/signin`);
    else feedback.show(result.ok ? text.saved : result.status === 400 ? text.invalidName : result.status === 429 ? people.rate : text.failed);
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
      <input disabled={busy || !hydrated} id="display-name" name="displayName" dir="auto" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} required aria-describedby="name-hint" />
      <p id="name-hint">{text.nameHint}</p>
      {profile.displayName === null && <p className="field-hint">{people.suggestionHint}</p>}
      <label><input type="checkbox" checked={visible} disabled={busy || !hydrated} onChange={event => setVisible(event.target.checked)} aria-describedby="directory-visibility-hint" />{people.visible}</label>
      <p id="directory-visibility-hint" className="field-hint">{people.visibilityHint}</p>
      <button disabled={busy || !hydrated} type="submit">{busy ? text.busy : text.save}</button>
    </form>
    <p id="identity-feedback" role="status" tabIndex={-1}>{feedback.message}</p>
    <button className="button-secondary profile-logout" disabled={busy || !hydrated} type="button" onClick={endSession}>{text.logout}</button>
  </>;
}
