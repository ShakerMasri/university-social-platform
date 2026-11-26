"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "../icons";
import { IconButton } from "./button";
import styles from "./dialog.module.css";

export type DialogProps = {
  open: boolean;
  /** Called once per close, whether by Escape, the close button or the open prop. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  closeLabel: string;
  children?: ReactNode;
  /** Action buttons; the primary action goes last. */
  footer?: ReactNode;
};

/**
 * Modal dialog on the native <dialog> element: the browser traps focus, makes
 * the page inert and closes on Escape. Focus returns to the element that was
 * focused when the dialog opened (usually its trigger).
 */
export function Dialog({ open, onClose, title, description, closeLabel, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  // True once this opening's close has been reported, so onClose runs once
  // per close even though Escape and the close button also queue a native
  // "close" event.
  const closeReported = useRef(true);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeReported.current = false;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Report a close to the parent synchronously. The native "close" event is
  // queued, so waiting for it would let a fast reopen (Escape, then Enter on
  // the trigger) race the stale event and leave the dialog closed.
  function finishClose() {
    if (closeReported.current) return;
    closeReported.current = true;
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    if (target?.isConnected) target.focus();
    onCloseRef.current();
  }
  const finishCloseRef = useRef(finishClose);
  useEffect(() => { finishCloseRef.current = finishClose; });

  function requestClose() {
    ref.current?.close();
    finishClose();
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Escape: the browser closes the dialog right after this event.
    const handleCancel = () => finishCloseRef.current();
    // Closes from other paths (such as a form with method="dialog"). Ignore a
    // late event if the dialog has already been reopened.
    const handleClose = () => { if (!dialog.open) finishCloseRef.current(); };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>{title}</h2>
        <IconButton label={closeLabel} icon={<CloseIcon />} onClick={requestClose} />
      </div>
      {description && <p id={descriptionId} className={styles.description}>{description}</p>}
      {open && children && <div className={styles.body}>{children}</div>}
      {footer && <div className={styles.footer}>{footer}</div>}
    </dialog>
  );
}
