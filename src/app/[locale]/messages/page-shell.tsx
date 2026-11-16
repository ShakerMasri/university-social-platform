import { randomUUID } from "node:crypto";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { messagingText } from "@/i18n/messaging";
import { authorized, CommunityError } from "@/server/communities/service";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../identity-shell";
import { MessageInbox } from "./inbox";
import { MessageThread } from "./thread";
export async function MessagingPageShell({ locale, id }: { locale: Locale; id?: string }) {
  let scope: string | undefined, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    scope = await authorized(identityDatabase(context), (await cookies()).get(sessionCookie)?.value, async (tx, actor) =>
      (await tx.profile.findUniqueOrThrow({ where: { userId: actor }, select: { directoryId: true } })).directoryId, true);
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("messaging.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  const text = messagingText[locale];
  // Protected snapshots are fetched on mount instead of restoring private
  // history from a cached server payload. Every RSC refresh remounts the client.
  return <IdentityShell locale={locale} path={id ? `messages/${id}` : "messages"}>
    <h1>{text.title}</h1>
    {scope ? id ? <MessageThread key={randomUUID()} locale={locale} id={id} scope={scope} /> : <MessageInbox key={randomUUID()} locale={locale} scope={scope} />
      : <p role="alert">{status === 403 ? <Link href={`/${locale}/profile`}>{text.setup}</Link> : text.failed}</p>}
  </IdentityShell>;
}
