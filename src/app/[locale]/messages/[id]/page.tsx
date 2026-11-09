import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { communityId } from "@/server/communities/policy";
import { MessagingPageShell } from "../page-shell";
export const dynamic = "force-dynamic";
export default async function Conversation({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params; if (!isLocale(locale)) notFound();
  let conversationId: string;
  try { conversationId = communityId(id); } catch { notFound(); }
  return <MessagingPageShell locale={locale} id={conversationId} />;
}
