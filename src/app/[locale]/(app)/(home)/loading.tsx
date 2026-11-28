import type { Locale } from "@/i18n/locales";
import { feedText } from "@/i18n/feed";
import { Skeleton, SkeletonGroup } from "@/ui/components/skeleton";
import { ByLocale } from "@/app/[locale]/shell/by-locale";

// Shown while Home renders, including tab switches (each tab is its own URL).
// Loading files receive no params, so a tiny client switch picks the language.
function HomeLoading({ locale }: { locale: Locale }) {
  return (
    <SkeletonGroup label={feedText[locale].loading}>
      <Skeleton blockSize="7rem" />
      <Skeleton shape="text" inlineSize="40%" />
      <Skeleton blockSize="12rem" />
      <Skeleton blockSize="12rem" />
    </SkeletonGroup>
  );
}

export default function Loading() {
  return <ByLocale en={<HomeLoading locale="en" />} ar={<HomeLoading locale="ar" />} other={null} />;
}
