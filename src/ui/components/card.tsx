import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../class-names";
import styles from "./card.module.css";

type CardElement = "div" | "section" | "article" | "li" | "aside";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: CardElement;
  /** Default padding; turn off for cards that manage their own inner layout. */
  padded?: boolean;
};

/** A bordered surface (14px radius, no shadow). */
export function Card({ as: Element = "div", padded = true, className, children, ...props }: CardProps) {
  return <Element {...props} className={classNames(styles.card, padded && styles.padded, className)}>{children}</Element>;
}

/** Card heading row: a section heading and optional actions at the end. */
export function CardHeader({ title, headingLevel = 2, id, actions }: { title: ReactNode; headingLevel?: 2 | 3 | 4; id?: string; actions?: ReactNode }) {
  const Heading = (`h${headingLevel}` as "h2" | "h3" | "h4");
  return (
    <div className={styles.header}>
      <Heading id={id} className={styles.title}>{title}</Heading>
      {actions}
    </div>
  );
}
