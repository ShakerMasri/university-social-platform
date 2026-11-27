import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isLocale } from "@/i18n/locales";
import { identityText } from "@/i18n/identity";
import { requireLocalIdentity } from "@/server/identity/local";
import { SignInForm } from "@/app/[locale]/identity-forms";

export const dynamic = "force-dynamic";
export default async function SignIn({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let enabled = false, preview = false;
  try { const { context } = requireLocalIdentity(await headers()); enabled = true; preview = context.mode === "preview"; } catch { /* Deliberately disabled outside the owned harness. */ }
  return <>{enabled ? <SignInForm locale={locale} preview={preview} /> : <><h1>{identityText[locale].signIn}</h1><p>{identityText[locale].disabled}</p></>}</>;
}
