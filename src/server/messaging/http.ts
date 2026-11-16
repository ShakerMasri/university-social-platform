import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { communityBody, communityReply, InputError, validInput } from "../communities/http.ts";
import { authorized, CommunityError } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { identityDatabase, requireLocalIdentity } from "../identity/local.ts";
import { sessionCookie } from "../identity/policy.ts";
import { reportOperationalFailure } from "../diagnostics.ts";
import { MessagingError } from "./service.ts";
import { messageRequestBytes } from "./policy.ts";

export function messagingBody(request: NextRequest) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) throw new InputError("Invalid content type");
  return communityBody(request, messageRequestBytes);
}

export async function messagingHTTP(request: NextRequest, handle: (db: PrismaClient, token: unknown) => Promise<NextResponse>) {
  let enabled = false;
  try {
    const { context } = requireLocalIdentity(request.headers); enabled = true;
    if (request.method !== "GET" && request.headers.get("origin") !== context.origin) return communityReply({ ok: false }, 403);
    const db = identityDatabase(context), token = request.cookies.get(sessionCookie)?.value;
    // A browser's current-view precondition is never an identity credential.
    // It prevents an old draft/action from being submitted by a newly signed-in
    // account, including when both accounts participate in this conversation.
    const expectedScope = request.headers.get("x-messaging-scope");
    if (expectedScope !== null) {
      const scope = validInput(() => communityId(expectedScope));
      await authorized(db, token, async (tx, actor) => {
        const profile = await tx.profile.findUnique({ where: { userId: actor }, select: { directoryId: true } });
        if (profile?.directoryId !== scope) throw new MessagingError(403);
      }, true);
    }
    return await handle(db, token);
  } catch (error) {
    const expected = error instanceof MessagingError || error instanceof CommunityError || error instanceof InputError;
    if (enabled && !expected) reportOperationalFailure("messaging.http.failed");
    return communityReply({ ok: false }, error instanceof MessagingError || error instanceof CommunityError ? error.status : error instanceof InputError ? 400 : 503);
  }
}
