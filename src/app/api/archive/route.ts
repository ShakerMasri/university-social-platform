import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { requireLocalIdentity } from "@/server/identity/local";
import { archiveInput } from "@/server/archive/policy";
import { searchArchive } from "@/server/archive/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    if (request.nextUrl.search.length > 4096) return communityReply({ ok: false }, 400);
    const input = validInput(() => archiveInput(request.nextUrl.searchParams));
    const { context } = requireLocalIdentity(request.headers);
    return communityReply({ ok: true, ...await searchArchive(db, token, input, context.rateKey) });
  }, "archive.http.failed");
}
