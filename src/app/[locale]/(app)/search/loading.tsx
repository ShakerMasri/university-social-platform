"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { archiveText } from "@/i18n/archive";
import { Skeleton, SkeletonGroup } from "@/ui/components/skeleton";
import styles from "./search.module.css";

// Shown inside the persistent shell while the server runs the searches.
// Loading files receive no params, so the locale comes from the URL.
export default function SearchLoading() {
  const value = useParams<{ locale: string }>().locale;
  const locale = isLocale(value) ? value : "en";
  return (
    <div className={styles.page}>
      <SkeletonGroup label={archiveText[locale].loading}>
        <Skeleton blockSize="2rem" inlineSize="40%" />
        <Skeleton blockSize="9rem" />
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} blockSize="7rem" />)}
      </SkeletonGroup>
    </div>
  );
}
