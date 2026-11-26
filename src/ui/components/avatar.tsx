import { avatarInitials, avatarTone } from "../avatar-initials";
import { classNames } from "../class-names";
import styles from "./avatar.module.css";

export type AvatarProps = {
  name: string;
  /** Stable user id; picks the color so it never changes with the name. */
  seed: string;
  size?: "small" | "medium" | "large";
  /**
   * Decorative by default, because the name is shown next to the avatar.
   * Set false when the avatar stands alone, so it is announced by name.
   */
  decorative?: boolean;
  className?: string;
};

/** Initials avatar (decision 9: no profile pictures yet). */
export function Avatar({ name, seed, size = "medium", decorative = true, className }: AvatarProps) {
  const tone = styles[`tone${avatarTone(seed)}`];
  return (
    <span
      className={classNames(styles.avatar, styles[size], tone, className)}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
    >
      <bdi>{avatarInitials(name)}</bdi>
    </span>
  );
}
