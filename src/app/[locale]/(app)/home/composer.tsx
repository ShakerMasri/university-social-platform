"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { homeText } from "@/i18n/home";
import { postText } from "@/i18n/posts";
import { postTypes, type PostType } from "@/server/posts/policy";
import { useHydrated } from "@/app/use-hydrated";
import { onSessionChange } from "@/app/[locale]/session-change";
import { Avatar } from "@/ui/components/avatar";
import { ButtonLink } from "@/ui/components/button";
import type { ChipTone } from "@/ui/components/chip";
import styles from "./home.module.css";

const typeTone: Record<PostType, ChipTone> = { QUESTION: "question", DISCUSSION: "discussion", RESOURCE: "resource", ANNOUNCEMENT: "announcement" };
// The form (picker, fields, publishing) loads on first use.
const loadForm = () => import("./composer-form");
const ComposerForm = lazy(loadForm);

/**
 * Home's post composer (plan decision 6). Collapsed, it is one "Start a
 * post" button plus quick type chips. Opening it loads the viewer's MEMBER
 * communities; Announcement is offered only in communities the viewer
 * created. The posts API is unchanged and checks all of this again.
 */
export function Composer({ locale, displayName, avatarSeed }: { locale: Locale; displayName: string | null; avatarSeed: string }) {
  const text = homeText[locale], posts = postText[locale], hydrated = useHydrated();
  const [open, setOpen] = useState(false), [initialType, setInitialType] = useState<PostType>("QUESTION");
  const startRef = useRef<HTMLButtonElement>(null);

  // Another tab signed in or out, or the page is left (it may come back from
  // the back/forward cache for another account): drop the form and the
  // community names. Home also keys this component by account.
  useEffect(() => {
    const close = () => setOpen(false);
    const stopSession = onSessionChange(close);
    window.addEventListener("pagehide", close);
    return () => { stopSession(); window.removeEventListener("pagehide", close); };
  }, []);

  if (!displayName) {
    return (
      <section className={styles.composer} aria-labelledby="composer-heading">
        <h2 id="composer-heading" className="ui-visually-hidden">{text.composer}</h2>
        <p className={styles.composerNote}>{text.needName}</p>
        <p><ButtonLink href={`/${locale}/profile`} prefetch={false} variant="primary">{text.addName}</ButtonLink></p>
      </section>
    );
  }
  const start = (type: PostType) => { setInitialType(type); setOpen(true); };
  const warm = () => { void loadForm(); };
  return (
    <section className={styles.composer} aria-labelledby="composer-heading">
      <h2 id="composer-heading" className="ui-visually-hidden">{text.composer}</h2>
      {open
        ? <Suspense fallback={<p role="status" className={styles.composerNote}>{text.loadingCommunities}</p>}>
          <ComposerForm locale={locale} initialType={initialType} onClose={() => { setOpen(false); requestAnimationFrame(() => startRef.current?.focus()); }} />
        </Suspense>
        : <>
          <div className={styles.composerStart}>
            <Avatar name={displayName} seed={avatarSeed} />
            <button ref={startRef} type="button" className={styles.startButton} disabled={!hydrated} onPointerEnter={warm} onFocus={warm} onClick={() => start("QUESTION")}>{text.startPost}</button>
          </div>
          <div className={styles.quickTypes} role="group" aria-label={text.startAs}>
            {postTypes.filter(type => type !== "ANNOUNCEMENT").map(type => (
              <button key={type} type="button" disabled={!hydrated} className={`${styles.quickType} ${styles[typeTone[type]]}`} onPointerEnter={warm} onFocus={warm} onClick={() => start(type)}>
                {posts.types[type]}
              </button>
            ))}
          </div>
        </>}
    </section>
  );
}
