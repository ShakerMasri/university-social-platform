"use client";
import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { uiText } from "@/i18n/ui";
import { Dialog } from "@/ui/components/dialog";
import styles from "./shell.module.css";

/**
 * The mobile More sheet (decision 5), loaded on first press of More. It stays
 * mounted afterwards, so the dialog returns focus to More when it closes.
 */
export default function MoreDialog({ locale, open, onClose }: { locale: Locale; open: boolean; onClose: () => void }) {
  const text = shellText[locale];
  return (
    <Dialog open={open} onClose={onClose} title={text.moreTitle} closeLabel={uiText[locale].close}>
      <ul className={styles.moreList}>
        <li><Link prefetch={false} href={`/${locale}/profile`} className={styles.moreLink} onClick={onClose}>{text.profileSettings}</Link></li>
      </ul>
    </Dialog>
  );
}
