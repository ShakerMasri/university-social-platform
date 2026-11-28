import "server-only";
import { cookies, headers } from "next/headers";
import { authorized, CommunityError } from "@/server/communities/service";
import { requireLocalIdentity, identityDatabase } from "@/server/identity/local";
import { sessionCookie } from "@/server/identity/policy";
import { feedViewer } from "@/server/feed/policy";
import { reportOperationalFailure } from "@/server/diagnostics";

/**
 * The opaque viewer key the feed list checks every response and session
 * check against. "signed-out" means the session ended between the header's
 * read and this one.
 */
export async function loadFeedViewer(): Promise<{ state: "ready"; viewer: string } | { state: "signed-out" } | { state: "failed" }> {
  let enabled = false;
  try {
    const { context } = requireLocalIdentity(await headers()); enabled = true;
    const viewer = await authorized(identityDatabase(context), (await cookies()).get(sessionCookie)?.value,
      async (_tx, userId) => feedViewer(userId, context.rateKey));
    return { state: "ready", viewer };
  } catch (error) {
    if (error instanceof CommunityError && error.status === 401) return { state: "signed-out" };
    if (enabled && !(error instanceof CommunityError)) reportOperationalFailure("feed.page.failed");
    return { state: "failed" };
  }
}
