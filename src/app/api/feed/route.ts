import type { NextRequest } from "next/server";
import { communityHTTP, communityReply } from "@/server/communities/http";
import { requireLocalIdentity } from "@/server/identity/local";
import { listFeed } from "@/server/feed/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const { context } = requireLocalIdentity(request.headers);
    return communityReply({ ok: true, ...await listFeed(db, token, request.nextUrl.searchParams, context.rateKey) });
  }, "feed.http.failed");
}
