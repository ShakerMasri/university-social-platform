"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { peopleText } from "@/i18n/people";
import { Button } from "@/ui/components/button";
import { TextField } from "@/ui/components/field";
import { classNames } from "@/ui/class-names";
import { capturePendingConfirmation, clearPendingConfirmation, pendingConfirmationToken } from "./pending-confirmation";
import { useHydrated } from "@/app/use-hydrated";
import { announceSessionChange } from "./session-change";
import { postIdentity } from "./identity-client";
import { announceDisplayName } from "./shell/shell-events";
import styles from "./identity.module.css";

type Tone = "info" | "success" | "error";

/**
 * One feedback line per form, present from the first render so it is
 * announced. Focus moves to it after each result, so keyboard and screen
 * reader users land on the outcome.
 */
function useFeedback() {
  const [state, setState] = useState<{ message: string; tone: Tone }>({ message: "", tone: "info" });
  const show = (message: string, tone: Tone) => {
    setState({ message, tone });
    requestAnimationFrame(() => document.getElementById("identity-feedback")?.focus());
  };
  return { ...state, show, clear: () => setState({ message: "", tone: "info" }) };
}

function Feedback({ message, tone }: { message: string; tone: Tone }) {
  return <p id="identity-feedback" role="status" tabIndex={-1} className={classNames(styles.feedback, message && styles[tone])}>{message}</p>;
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
    const result = await postIdentity("request", { email, locale });
    setBusy(false); setRequested(result.ok);
    feedback.show(result.ok ? text.requested : text.failed, result.ok ? "success" : "error");
  }
  async function openPreviewConfirmation() {
    setBusy(true);
    try {
      const response = await fetch("/__local-preview/confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), cache: "no-store" });
      const message = await response.json() as { token?: unknown };
      if (!response.ok || typeof message.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(message.token)) { feedback.show(text.linkError, "error"); return; }
      window.location.assign(`/${locale}/verify#${message.token}`);
    } catch { feedback.show(text.failed, "error"); }
    finally { setBusy(false); }
  }
  return (
    <section className={styles.panel} aria-labelledby="signin-heading">
      <h1 id="signin-heading" className={styles.heading}>{text.signIn}</h1>
      <p className={styles.intro}>{text.signInIntro}</p>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <TextField
          id="email" name="email" label={text.email} hint={<SyntheticEmailHint text={text.hint} />}
          type="text" inputMode="email" autoComplete="email" dir="ltr" required
          disabled={!hydrated} value={email}
          onChange={(event) => { setEmail(event.target.value); setRequested(false); }}
        />
        <Button type="submit" variant="primary" className={styles.submit} disabled={!hydrated} pending={busy}>
          {busy ? text.busy : text.request}
        </Button>
      </form>
      <Feedback message={feedback.message} tone={feedback.tone} />
      {preview && <p className={styles.note}><SyntheticEmailHint text={text.previewHint} /></p>}
      {preview && requested && <Button variant="secondary" disabled={!hydrated} pending={busy} onClick={() => void openPreviewConfirmation()}>{text.previewOpen}</Button>}
    </section>
  );
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
    const result = await postIdentity("confirm", { token: pendingConfirmationToken(), locale });
    setBusy(false);
    if (result.ok || result.status === 400) clearPendingConfirmation();
    if (result.ok) {
      announceSessionChange();
      // The profile page sends people who already have a name on to Home.
      window.location.assign(`/${locale}/profile?welcome=1`);
    } else feedback.show(text.linkError, "error");
  }
  return (
    <section className={styles.panel} aria-labelledby="verify-heading">
      <h1 id="verify-heading" className={styles.heading}>{text.confirm}</h1>
      <p className={styles.intro}>{text.confirmHint}</p>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <Button type="submit" variant="primary" className={styles.submit} disabled={!hydrated} pending={busy}>
          {busy ? text.busy : text.confirm}
        </Button>
      </form>
      <Feedback message={feedback.message} tone={feedback.tone} />
      <p className={styles.note}><Link href={`/${locale}/signin`} onClick={clearPendingConfirmation}>{text.newLink}</Link></p>
    </section>
  );
}

export function ProfileForm({ locale, profile, welcome = false }: {
  locale: Locale;
  profile: { email: string; displayName: string | null; suggestion: string };
  /** First sign-in: ask for a display name, then continue to Home. */
  welcome?: boolean;
}) {
  const hydrated = useHydrated();
  const text = identityText[locale];
  const people = peopleText[locale];
  const [name, setName] = useState(profile.displayName ?? `${people.suggestion} ${profile.suggestion}`);
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
        body: JSON.stringify({ displayName: name }), cache: "no-store", signal: controller.signal });
      result = { ok: response.ok, status: response.status };
    } catch { /* Keep the draft for an explicit retry; no persistence is claimed. */ }
    finally { clearTimeout(timeout); }
    if (pending.current !== controller) return;
    pending.current = null;
    setBusy(false);
    if (result.status === 401) window.location.assign(`/${locale}/signin`);
    else if (result.ok && welcome) window.location.assign(`/${locale}`);
    else if (result.ok) { announceDisplayName(name.trim()); feedback.show(text.saved, "success"); }
    else feedback.show(result.status === 400 ? text.invalidName : result.status === 429 ? people.rate : text.failed, "error");
  }
  async function endSession() {
    setBusy(true);
    const result = await postIdentity("logout", {});
    setBusy(false);
    if (result.ok) {
      announceSessionChange();
      window.location.assign(`/${locale}/signin`);
    } else feedback.show(text.failed, "error");
  }
  return (
    <section className={styles.panel} aria-labelledby="profile-heading">
      <h1 id="profile-heading" className={styles.heading}>{welcome ? text.welcomeTitle : text.profile}</h1>
      {welcome && <p className={styles.intro}>{text.welcomeIntro}</p>}
      <dl className={styles.facts}>
        <dt>{text.emailLabel}</dt>
        <dd><bdi dir="ltr">{profile.email}</bdi></dd>
      </dl>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <TextField
          id="display-name" name="displayName" label={text.name} required
          hint={<>{text.nameHint}{profile.displayName === null && <> {people.suggestionHint}</>}</>}
          dir="auto" autoComplete="nickname" disabled={busy || !hydrated}
          value={name} onChange={(event) => setName(event.target.value)}
        />
        <p className={styles.note}>{people.directoryHint}</p>
        <Button type="submit" variant="primary" className={styles.submit} disabled={!hydrated} pending={busy}>
          {busy ? text.busy : welcome ? text.welcomeSave : text.save}
        </Button>
      </form>
      <Feedback message={feedback.message} tone={feedback.tone} />
      {!welcome && (
        <div className={styles.secondaryActions}>
          <Button variant="secondary" disabled={!hydrated} pending={busy} onClick={() => void endSession()}>{text.logout}</Button>
        </div>
      )}
    </section>
  );
}
