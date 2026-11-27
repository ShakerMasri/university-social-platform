"use client";
import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useHydrated } from "@/app/use-hydrated";
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

// The open list loads on first use (or when the trigger is hovered or
// focused), so pages carry only the trigger.
const loadMenuList = () => import("./menu-list");
const MenuList = lazy(loadMenuList);

/**
 * Menu button (WAI-ARIA APG pattern). Enter, Space or Arrow Down opens on the
 * first item, Arrow Up on the last; arrows, Home and End move; Escape closes
 * and returns focus to the trigger; Tab or an outside click closes.
 */
export function Menu({ label, items, icon, variant = "ghost", align = "end" }: MenuProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState<"first" | "last">("first");
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) rootRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")?.focus();
  }
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFocusOnOpen(event.key === "ArrowUp" ? "last" : "first");
      setOpen(true);
    }
  }
  const warm = () => { void loadMenuList(); };

  const triggerProps = {
    variant,
    disabled: !hydrated,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => { setFocusOnOpen("first"); setOpen((value) => !value); },
    onKeyDown: onTriggerKeyDown,
    onPointerEnter: warm,
    onFocus: warm,
  };

  return (
    <div ref={rootRef} className={styles.menu}>
      {icon ? <IconButton {...triggerProps} label={label} icon={icon} /> : <Button {...triggerProps}>{label}</Button>}
      {open && (
        <Suspense fallback={null}>
          <MenuList id={menuId} label={label} items={items} align={align} focusOnOpen={focusOnOpen} rootRef={rootRef} onClose={close} />
        </Suspense>
      )}
    </div>
  );
}
