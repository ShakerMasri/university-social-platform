import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../class-names";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "default" | "compact";

type CommonProps = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode };

function buttonClass(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return classNames(styles.button, styles[variant], size === "compact" && styles.compact, extra);
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Work in progress. The button stays focusable (aria-disabled, not disabled)
   * so keyboard and screen reader focus is not lost, and activation is ignored.
   * Only set from client state.
   */
  pending?: boolean;
};

export function Button({ variant = "primary", size = "default", icon, pending = false, className, children, type = "button", onClick, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={pending ? (event) => event.preventDefault() : onClick}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/** A link styled as a button, for navigation. Use Button for actions. */
export function ButtonLink({ variant = "secondary", size = "default", icon, className, children, href, ...props }: ButtonLinkProps) {
  return (
    <Link {...props} href={href} className={buttonClass(variant, size, className)}>
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </Link>
  );
}

export type IconButtonProps = Omit<ButtonProps, "children" | "icon" | "aria-label"> & {
  /** Accessible name; required because the button shows only an icon. */
  label: string;
  icon: ReactNode;
  /** Toggle state for toggle buttons; omit for plain actions. */
  pressed?: boolean;
};

export function IconButton({ label, icon, pressed, variant = "ghost", className, ...props }: IconButtonProps) {
  return (
    <Button {...props} variant={variant} aria-label={label} aria-pressed={pressed} className={classNames(styles.iconOnly, className)}>
      <span className={styles.icon}>{icon}</span>
    </Button>
  );
}
