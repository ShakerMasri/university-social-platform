import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, InputError } from "@/server/communities/http";
import { authorized, CommunityError } from "@/server/communities/service";
import { requireLocalIdentity } from "@/server/identity/local";
import { feedViewer } from "@/server/feed/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const expected = request.headers.get("X-Feed-Expected-Viewer");
    if (request.nextUrl.search || !expected || !/^[0-9a-f]{64}$/.test(expected)) {
      throw new InputError("Invalid feed session check");
    }
    const { context } = requireLocalIdentity(request.headers);
    await authorized(db, token, async (_tx, userId) => {
      if (feedViewer(userId, context.rateKey) !== expected) throw new CommunityError(403);
    });
    return communityReply({ ok: true });
  }, "feed.http.failed");
}
