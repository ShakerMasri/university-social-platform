"use client";
import { useSyncExternalStore } from "react";
import { useHydrated } from "@/app/use-hydrated";
import { MoonIcon, SunIcon } from "../icons";
import { themeCookie, type Theme } from "../theme";
import { IconButton } from "./button";
import styles from "./theme-toggle.module.css";

const darkQuery = "(prefers-color-scheme: dark)";

function effectiveTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia(darkQuery).matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/**
 * Header theme switch: a toggle button "Dark theme" (aria-pressed when dark).
 * The default follows the system; a click stores an explicit choice in the
 * `theme` cookie, which the server layout reads on the next request.
 */
export function ThemeToggle({ label, serverTheme }: {
  /** Accessible name, for example "Dark theme". */
  label: string;
  /** The cookie value the server rendered with, or null when following the system. */
  serverTheme: Theme | null;
}) {
  const hydrated = useHydrated();
  const theme = useSyncExternalStore(subscribe, effectiveTheme, () => serverTheme ?? "light");

  function toggle() {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = themeCookie(next, window.location.protocol === "https:");
  }

  return (
    <IconButton
      label={label}
      pressed={theme === "dark"}
      disabled={!hydrated}
      onClick={toggle}
      icon={<span className={styles.icons}><MoonIcon className={styles.moon} /><SunIcon className={styles.sun} /></span>}
    />
  );
}
