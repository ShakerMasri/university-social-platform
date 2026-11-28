import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { feedRedirectHref } from "../../home/home-href";

export const dynamic = "force-dynamic";

// For you is Home's second tab now (plan decision 1). Old links keep every query parameter.
export default async function ForYouRedirect({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(feedRedirectHref(locale, await searchParams, true));
}
