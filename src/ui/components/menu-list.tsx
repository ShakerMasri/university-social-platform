"use client";
import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { classNames } from "../class-names";
import type { MenuItem } from "./menu";
import styles from "./menu.module.css";

/**
 * The open part of Menu, loaded on first open so pages don't carry it.
 * Arrows, Home and End move; Escape closes and returns focus to the
 * trigger; Tab or an outside pointer press closes.
 */
export default function MenuList({ id, label, items, align, focusOnOpen, rootRef, onClose }: {
  id: string; label: string; items: readonly MenuItem[]; align: "start" | "end";
  focusOnOpen: "first" | "last";
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: (returnFocus: boolean) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const menuItems = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
  function focusItem(index: number) {
    const all = menuItems();
    if (all.length) all[(index + all.length) % all.length].focus();
  }

  useEffect(() => {
    const all = menuItems();
    (focusOnOpen === "last" ? all[all.length - 1] : all[0])?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // Runs once per opening: the list mounts when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const all = menuItems();
    const index = all.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); focusItem(index + 1); break;
      case "ArrowUp": event.preventDefault(); focusItem(index - 1); break;
      case "Home": event.preventDefault(); focusItem(0); break;
      case "End": event.preventDefault(); focusItem(all.length - 1); break;
      case "Escape": event.preventDefault(); onClose(true); break;
      case "Tab": onClose(false); break;
    }
  }

  return (
    <ul ref={listRef} id={id} role="menu" aria-label={label} className={classNames(styles.list, align === "end" ? styles.alignEnd : styles.alignStart)} onKeyDown={onKeyDown}>
      {items.map((item) => {
        if (item.kind === "separator") return <li key={item.key} role="separator" className={styles.separator} />;
        return (
          <li key={item.label} role="none">
            {item.kind === "link" ? (
              <Link role="menuitem" tabIndex={-1} href={item.href} className={styles.item} onClick={() => onClose(false)}>
                {item.icon}{item.label}
              </Link>
            ) : (
              <button
                type="button" role="menuitem" tabIndex={-1}
                className={classNames(styles.item, item.tone === "danger" && styles.danger)}
                onClick={() => { onClose(true); item.onSelect(); }}
              >
                {item.icon}{item.label}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
