"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useHydrated } from "@/app/use-hydrated";
import { classNames } from "../class-names";
import { Button, IconButton, type ButtonVariant } from "./button";
import styles from "./menu.module.css";

export type MenuItem =
  | { kind: "link"; label: string; href: string; icon?: ReactNode }
  | { kind: "action"; label: string; onSelect: () => void; icon?: ReactNode; tone?: "danger" }
  | { kind: "separator"; key: string };

export type MenuProps = {
  /** Accessible name of the trigger, for example "More actions". */
  label: string;
  items: readonly MenuItem[];
  /** Icon-only trigger; omit to show `label` as visible text. */
  icon?: ReactNode;
  variant?: ButtonVariant;
  align?: "start" | "end";
};

/**
 * Menu button (WAI-ARIA APG pattern). Enter, Space or Arrow Down opens on the
 * first item, Arrow Up on the last; arrows, Home and End move; Escape closes
 * and returns focus to the trigger; Tab or an outside click closes.
 */
export function Menu({ label, items, icon, variant = "ghost", align = "end" }: MenuProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");

  const menuItems = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
  function focusItem(index: number) {
    const all = menuItems();
    if (all.length) all[(index + all.length) % all.length].focus();
  }
  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const all = menuItems();
    (focusOnOpen.current === "last" ? all[all.length - 1] : all[0])?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOnOpen.current = event.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    }
  }
  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const all = menuItems();
    const index = all.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); focusItem(index + 1); break;
      case "ArrowUp": event.preventDefault(); focusItem(index - 1); break;
      case "Home": event.preventDefault(); focusItem(0); break;
      case "End": event.preventDefault(); focusItem(all.length - 1); break;
      case "Escape": event.preventDefault(); close(true); break;
      case "Tab": setOpen(false); break;
    }
  }

  const triggerProps = {
    ref: triggerRef,
    variant,
    disabled: !hydrated,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => { focusOnOpen.current = "first"; setOpen((value) => !value); },
    onKeyDown: onTriggerKeyDown,
  };

  return (
    <div ref={rootRef} className={styles.menu}>
      {icon ? <IconButton {...triggerProps} label={label} icon={icon} /> : <Button {...triggerProps}>{label}</Button>}
      {open && (
        <ul ref={listRef} id={menuId} role="menu" aria-label={label} className={classNames(styles.list, align === "end" ? styles.alignEnd : styles.alignStart)} onKeyDown={onListKeyDown}>
          {items.map((item) => {
            if (item.kind === "separator") return <li key={item.key} role="separator" className={styles.separator} />;
            return (
              <li key={item.label} role="none">
                {item.kind === "link" ? (
                  <Link role="menuitem" tabIndex={-1} href={item.href} className={styles.item} onClick={() => setOpen(false)}>
                    {item.icon}{item.label}
                  </Link>
                ) : (
                  <button
                    type="button" role="menuitem" tabIndex={-1}
                    className={classNames(styles.item, item.tone === "danger" && styles.danger)}
                    onClick={() => { close(true); item.onSelect(); }}
                  >
                    {item.icon}{item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
