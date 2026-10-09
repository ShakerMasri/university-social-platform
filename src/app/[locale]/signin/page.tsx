import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { requireLocalIdentity } from "@/server/identity/local";
import { IdentityShell } from "../identity-shell";
import { SignInForm } from "../identity-forms";

export const dynamic = "force-dynamic";
export default async function SignIn({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let enabled = false;
  try { requireLocalIdentity(await headers()); enabled = true; } catch { /* Deliberately disabled outside the owned harness. */ }
  return <IdentityShell locale={locale} path="signin">{enabled ? <SignInForm locale={locale} /> : <><h1>{identityText[locale].signIn}</h1><p>{identityText[locale].disabled}</p></>}</IdentityShell>;
}
