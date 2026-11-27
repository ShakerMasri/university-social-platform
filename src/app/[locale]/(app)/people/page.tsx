import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { forwardedSearchHref } from "../search/search-request";

export const dynamic = "force-dynamic";

// People search is now the People tab of /search (plan decision 4). Person
// pages stay at /people/[id].
export default async function PeopleRedirect({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(forwardedSearchHref(locale, "people", await searchParams));
}
