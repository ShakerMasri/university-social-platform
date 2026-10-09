import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { requireLocalIdentity } from "@/server/identity/local";
import { IdentityShell } from "../identity-shell";
import { ConfirmationForm } from "../identity-forms";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };
export default async function Verify({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let enabled = false;
  try { requireLocalIdentity(await headers()); enabled = true; } catch { /* No mutation on GET, even when disabled. */ }
  return <IdentityShell locale={locale} path="verify">{enabled ? <ConfirmationForm locale={locale} /> : <><h1>{identityText[locale].confirm}</h1><p>{identityText[locale].disabled}</p></>}</IdentityShell>;
}
