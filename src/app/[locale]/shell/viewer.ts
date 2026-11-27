import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { identityDatabase, localIdentity, requireLocalIdentity } from "@/server/identity/local";
import { sessionCookie, tokenValid } from "@/server/identity/policy";
import { CommunityError } from "@/server/communities/service";
import { ownDirectoryProfile } from "@/server/profiles/service";
import { countUnreadNotifications } from "@/server/notifications/service";
import { reportOperationalFailure } from "@/server/diagnostics";

/**
 * What the header may show about the current visitor. Never carries the email
 * or user id to the client.
 * - anonymous: no valid session (or identity is disabled): show Sign in.
 * - unavailable: the session could not be checked: show neither Sign in nor
 *   account controls, so a database failure never looks like a sign-out.
 * - verified: account controls. `unread` is null when only the notification
 *   count failed; the rest of the header still works. The count is capped
 *   (see unreadCountLimit), so a value above the limit means "more".
 */
export type Viewer =
  | { state: "anonymous" }
  | { state: "unavailable" }
  | { state: "verified"; displayName: string | null; avatarSeed: string; unread: number | null };

/**
 * Memoized per request (React cache), so the layout's header and a page that
 * also needs the viewer (Home) share one session read.
 */
export const loadViewer = cache(async function loadViewer(): Promise<Viewer> {
  // Ordinary startup has no installed identity provider, and malformed
  // cookies need no database work.
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!localIdentity() || !tokenValid(token)) return { state: "anonymous" };
  let db: ReturnType<typeof identityDatabase>;
  let profile: Awaited<ReturnType<typeof ownDirectoryProfile>>;
  try {
    // An installed but invalid context is a failure, not a sign-out.
    db = identityDatabase(requireLocalIdentity(await headers()).context);
    // Read-only: no profile is created and nothing is enrolled in People.
    profile = await ownDirectoryProfile(db, token);
  } catch (error) {
    if (error instanceof CommunityError && error.status === 401) return { state: "anonymous" };
    reportOperationalFailure("shell.viewer.failed");
    return { state: "unavailable" };
  }
  let unread: number | null = null;
  try {
    unread = await countUnreadNotifications(db, token);
  } catch (error) {
    if (error instanceof CommunityError && error.status === 401) return { state: "anonymous" };
    if (!(error instanceof CommunityError)) reportOperationalFailure("shell.notifications.failed");
  }
  // The suggestion is an opaque, non-identifying label derived on the server;
  // it keeps the avatar color stable when the name changes.
  return { state: "verified", displayName: profile.displayName, avatarSeed: profile.suggestion, unread };
});
