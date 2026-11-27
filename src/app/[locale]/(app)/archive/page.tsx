import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { forwardedSearchHref } from "../search/search-request";

export const dynamic = "force-dynamic";

// The archive is now the Posts tab of /search (plan decision 4). Old links,
// including community-scoped ones, keep their query, community and type.
export default async function ArchiveRedirect({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(forwardedSearchHref(locale, "posts", await searchParams));
}
