"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "../icons";
import { classNames } from "../class-names";
import { IconButton } from "./button";
import styles from "./toast.module.css";

export type ToastTone = "info" | "success" | "error";
type Toast = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { notify: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
/** Info and success messages hide after this delay unless hovered or focused. Errors stay until dismissed. */
export const toastAutoHideMs = 6000;
const maxVisibleToasts = 3;

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

/**
 * Brief confirmations ("Link copied") and failures. Two text-only live
 * regions exist from the first render, so screen readers announce new
 * messages: polite for info and success, assertive (role="alert") for errors.
 * Toasts never hold the only copy of important information or the only way to
 * an action.
 *
 * Timing: each info/success toast has its own countdown, paused while the
 * pointer or keyboard focus is inside the toast area. Dismissing a focused
 * toast moves focus to the next toast, or back to where it came from.
 */
export function ToastProvider({ children, dismissLabel }: { children: ReactNode; dismissLabel: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const nextId = useRef(1);
  const regionRef = useRef<HTMLDivElement>(null);
  const remaining = useRef(new Map<number, number>());
  const focusOrigin = useRef<HTMLElement | null>(null);
  const paused = pointerInside || focusInside;

  const dismiss = useCallback((id: number) => {
    remaining.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    if (tone !== "error") remaining.current.set(id, toastAutoHideMs);
    setToasts((current) => {
      const next = [...current, { id, message, tone }];
      for (const dropped of next.slice(0, -maxVisibleToasts)) remaining.current.delete(dropped.id);
      return next.slice(-maxVisibleToasts);
    });
  }, []);

  // Count down only while not paused. On pause or any list change, store each
  // toast's time left, so adding a toast never restarts older countdowns.
  useEffect(() => {
    if (paused) return;
    const left = remaining.current; // the same Map for the provider's lifetime
    const startedAt = Date.now();
    const counting = toasts.filter((toast) => left.has(toast.id));
    const timers = counting.map((toast) => window.setTimeout(() => dismiss(toast.id), left.get(toast.id)));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      const elapsed = Date.now() - startedAt;
      for (const toast of counting) {
        const time = left.get(toast.id);
        if (time !== undefined) left.set(toast.id, Math.max(0, time - elapsed));
      }
    };
  }, [toasts, paused, dismiss]);

  function dismissFromButton(id: number) {
    const region = regionRef.current;
    const hadFocus = Boolean(region && region.contains(document.activeElement));
    if (hadFocus && region) {
      // Some browsers fire no blur when a focused element is removed: move focus first.
      const buttons = Array.from(region.querySelectorAll<HTMLElement>("[data-toast-dismiss]"));
      const index = buttons.findIndex((button) => button.dataset.toastDismiss === String(id));
      const neighbour = buttons[index + 1] ?? buttons[index - 1];
      const origin = focusOrigin.current;
      if (neighbour) neighbour.focus();
      else {
        focusOrigin.current = null;
        setFocusInside(false);
        if (origin?.isConnected) origin.focus();
      }
    }
    dismiss(id);
  }

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) focusOrigin.current = from;
    setFocusInside(true);
  }
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
  }

  const value = useMemo(() => ({ notify }), [notify]);
  const polite = toasts.filter((toast) => toast.tone !== "error");
  const assertive = toasts.filter((toast) => toast.tone === "error");

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        ref={regionRef}
        className={styles.region}
        onPointerEnter={() => setPointerInside(true)} onPointerLeave={() => setPointerInside(false)}
        onFocus={onFocus} onBlur={onBlur}
      >
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismissLabel={dismissLabel} onDismiss={dismissFromButton} />)}
      </div>
      {/* Message text only, so the dismiss button's name is not announced. */}
      <div role="status" className="ui-visually-hidden">{polite.map((toast) => <p key={toast.id}>{toast.message}</p>)}</div>
      <div role="alert" className="ui-visually-hidden">{assertive.map((toast) => <p key={toast.id}>{toast.message}</p>)}</div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, dismissLabel, onDismiss }: { toast: Toast; dismissLabel: string; onDismiss: (id: number) => void }) {
  const icon = toast.tone === "error" ? <AlertIcon size={18} /> : toast.tone === "success" ? <CheckIcon size={18} /> : <InfoIcon size={18} />;
  return (
    <div className={classNames(styles.toast, toast.tone === "error" && styles.error)}>
      <span className={styles.icon}>{icon}</span>
      <p className={styles.message}>{toast.message}</p>
      <IconButton
        label={dismissLabel} icon={<CloseIcon size={18} />} size="compact"
        data-toast-dismiss={toast.id} onClick={() => onDismiss(toast.id)}
      />
    </div>
  );
}
