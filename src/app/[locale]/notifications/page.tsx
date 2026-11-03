import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { notificationText } from "@/i18n/notifications";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { CommunityError } from "@/server/communities/service";
import { listNotifications } from "@/server/notifications/service";
import { reportOperationalFailure } from "@/server/diagnostics";
import { IdentityShell } from "../identity-shell";
import { NotificationsList } from "./notifications-list";
export const dynamic = "force-dynamic";
export default async function Notifications({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  let data: Awaited<ReturnType<typeof listNotifications>> | undefined, status = 503, enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    data = await listNotifications(identityDatabase(context), (await cookies()).get(sessionCookie)?.value);
  } catch (error) {
    if (error instanceof CommunityError) status = error.status;
    else if (enabled) reportOperationalFailure("notifications.page.failed");
  }
  if (status === 401) redirect(`/${locale}/signin`);
  return <IdentityShell locale={locale} path="notifications"><h1>{notificationText[locale].title}</h1>
    {data ? <NotificationsList locale={locale} initial={data} /> : <p role="alert">{notificationText[locale].failed}</p>}
  </IdentityShell>;
}
