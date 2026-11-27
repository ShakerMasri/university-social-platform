"use client";
import Link from "next/link";
import Form from "next/form";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { useHydrated } from "@/app/use-hydrated";
import { CommunitiesIcon, HomeIcon, MessageIcon, MoreIcon, SearchIcon } from "@/ui/icons";
import { Avatar } from "@/ui/components/avatar";
import { Menu } from "@/ui/components/menu";
import { useToast } from "@/ui/components/toast";
import { postIdentity } from "../identity-client";
import { announceSessionChange } from "../session-change";
import { onDisplayName } from "./shell-events";
import styles from "./shell.module.css";

// The More sheet loads on first press (or hover/focus of More).
const loadMoreDialog = () => import("./more-dialog");
const MoreDialog = lazy(loadMoreDialog);

const maxSearchLength = 200;

type Section = "home" | "communities" | "search" | "messages";

/** The section a path belongs to, and whether it is that section's own page. */
export function currentSection(pathname: string, locale: Locale): { section: Section | null; exact: boolean } {
  const rest = pathname.startsWith(`/${locale}`) ? pathname.slice(locale.length + 1) : pathname;
  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) return { section: "home", exact: true };
  if (parts[0] === "feed") return { section: "home", exact: false };
  if (parts[0] === "communities" || parts[0] === "messages" || parts[0] === "search") {
    return { section: parts[0], exact: parts.length === 1 };
  }
  return { section: null, exact: false };
}

function ariaCurrent(pathname: string, locale: Locale, section: Section) {
  const current = currentSection(pathname, locale);
  if (current.section !== section) return undefined;
  return current.exact ? "page" as const : "true" as const;
}

/** Header search: a GET form (next/form navigates client-side once hydrated). */
function SearchForm({ locale, query }: { locale: Locale; query: string }) {
  const text = shellText[locale];
  return (
    <Form role="search" aria-label={text.searchLabel} action={`/${locale}/search`} className={styles.search}>
      <label htmlFor="header-search" className="ui-visually-hidden">{text.searchLabel}</label>
      <input
        key={query} id="header-search" name="q" type="search" defaultValue={query}
        maxLength={maxSearchLength} enterKeyHint="search" autoComplete="off"
        placeholder={text.searchLabel} className={styles.searchInput}
      />
      <button type="submit" className={styles.searchSubmit} aria-label={text.searchSubmit}>
        <SearchIcon size={18} />
      </button>
    </Form>
  );
}

/** Shows the current query while on /search. */
export function HeaderSearch({ locale }: { locale: Locale }) {
  const pathname = usePathname(), params = useSearchParams();
  const query = currentSection(pathname, locale).section === "search" ? params.get("q") ?? "" : "";
  return <SearchForm locale={locale} query={query} />;
}

export function HeaderSearchWithoutQuery({ locale }: { locale: Locale }) {
  return <SearchForm locale={locale} query="" />;
}

function NavLink({ href, label, icon, current, className }: { href: string; label: string; icon: ReactNode; current: "page" | "true" | undefined; className: string }) {
  return (
    <Link prefetch={false} href={href} aria-current={current} className={className}>
      <span className={styles.navIcon}>{icon}</span>
      <span className={styles.navLabel}>{label}</span>
    </Link>
  );
}

/** Desktop navigation on the start side. Room is left for more items later. */
export function PrimaryNav({ locale }: { locale: Locale }) {
  const text = shellText[locale], pathname = usePathname();
  return (
    <nav aria-label={text.navigation} className={styles.primaryNav}>
      <ul className={styles.navList}>
        <li><NavLink href={`/${locale}`} label={text.home} icon={<HomeIcon />} current={ariaCurrent(pathname, locale, "home")} className={styles.navItem} /></li>
        <li><NavLink href={`/${locale}/communities`} label={text.communities} icon={<CommunitiesIcon />} current={ariaCurrent(pathname, locale, "communities")} className={styles.navItem} /></li>
        <li><NavLink href={`/${locale}/messages`} label={text.messages} icon={<MessageIcon />} current={ariaCurrent(pathname, locale, "messages")} className={styles.navItem} /></li>
      </ul>
    </nav>
  );
}

/** Mobile bottom bar (decision 5): Home, Communities, Search, Messages, More. */
export function MobileBar({ locale }: { locale: Locale }) {
  const text = shellText[locale], pathname = usePathname(), hydrated = useHydrated();
  const [moreOpen, setMoreOpen] = useState(false);
  // Mounted on first use and kept, so closing returns focus to More.
  const [moreLoaded, setMoreLoaded] = useState(false);
  return (
    <nav aria-label={text.mobileNavigation} className={styles.mobileBar}>
      <ul className={styles.mobileList}>
        <li><NavLink href={`/${locale}`} label={text.home} icon={<HomeIcon />} current={ariaCurrent(pathname, locale, "home")} className={styles.mobileItem} /></li>
        <li><NavLink href={`/${locale}/communities`} label={text.communities} icon={<CommunitiesIcon />} current={ariaCurrent(pathname, locale, "communities")} className={styles.mobileItem} /></li>
        <li><NavLink href={`/${locale}/search`} label={text.search} icon={<SearchIcon />} current={ariaCurrent(pathname, locale, "search")} className={styles.mobileItem} /></li>
        <li><NavLink href={`/${locale}/messages`} label={text.messages} icon={<MessageIcon />} current={ariaCurrent(pathname, locale, "messages")} className={styles.mobileItem} /></li>
        <li>
          <button type="button" className={styles.mobileItem} disabled={!hydrated} aria-haspopup="dialog"
            onPointerEnter={() => void loadMoreDialog()} onFocus={() => void loadMoreDialog()}
            onClick={() => { setMoreLoaded(true); setMoreOpen(true); }}>
            <span className={styles.navIcon}><MoreIcon /></span>
            <span className={styles.navLabel}>{text.more}</span>
          </button>
        </li>
      </ul>
      {moreLoaded && (
        <Suspense fallback={null}>
          <MoreDialog locale={locale} open={moreOpen} onClose={() => setMoreOpen(false)} />
        </Suspense>
      )}
    </nav>
  );
}

/** Avatar menu: profile and settings, and sign out. */
export function AccountMenu({ locale, displayName, avatarSeed }: { locale: Locale; displayName: string | null; avatarSeed: string }) {
  const text = shellText[locale], toast = useToast();
  // A name saved on the profile page shows at once; a server render resets it.
  const [name, setName] = useState(displayName);
  const [source, setSource] = useState(displayName);
  if (source !== displayName) { setSource(displayName); setName(displayName); }
  useEffect(() => onDisplayName(setName), []);
  async function signOut() {
    const result = await postIdentity("logout", {});
    if (result.ok) {
      announceSessionChange();
      window.location.assign(`/${locale}/signin`);
    } else toast.notify(text.signOutFailed, "error");
  }
  return (
    <Menu
      label={text.account}
      icon={<Avatar name={name ?? "?"} seed={avatarSeed} size="small" />}
      items={[
        { kind: "link", label: text.profileSettings, href: `/${locale}/profile` },
        { kind: "separator", key: "account-separator" },
        { kind: "action", label: text.signOut, onSelect: () => void signOut() },
      ]}
    />
  );
}
