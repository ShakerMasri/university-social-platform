import type { ReactNode } from "react";
import { AlertIcon, InboxIcon, LockIcon } from "../icons";
import { classNames } from "../class-names";
import styles from "./state.module.css";

type StateProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links, such as "Create a community" or "Try again". */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  icon?: ReactNode;
};

function StateFrame({ title, description, action, headingLevel = 2, icon, className, role }: StateProps & { className?: string; role?: "alert" | "status" }) {
  const Heading = (`h${headingLevel}` as "h2" | "h3" | "h4");
  return (
    <div className={classNames(styles.state, className)} role={role}>
      <span className={styles.icon}>{icon}</span>
      <Heading className={styles.title}>{title}</Heading>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/** Nothing to show yet, with the next useful action. */
export function EmptyState({ icon = <InboxIcon size={24} />, ...props }: StateProps) {
  return <StateFrame {...props} icon={icon} />;
}

export type ErrorStateProps = StateProps & {
  /** "error": something failed (offer a retry). "denied": no access to this content. */
  tone?: "error" | "denied";
  /**
   * Announce immediately (role="alert"). Use for errors that appear after a
   * user action; leave off for a page that loads already in this state.
   */
  announce?: boolean;
};

/** A failure or access-denied state with a clear message and a way forward. */
export function ErrorState({ tone = "error", announce = false, icon, ...props }: ErrorStateProps) {
  return (
    <StateFrame
      {...props}
      icon={icon ?? (tone === "denied" ? <LockIcon size={24} /> : <AlertIcon size={24} />)}
      className={styles[tone]}
      role={announce ? "alert" : undefined}
    />
  );
}
