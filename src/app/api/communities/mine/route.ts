import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, InputError } from "@/server/communities/http";
import { listMemberCommunities } from "@/server/communities/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The signed-in user's own MEMBER communities (Home composer). No parameters.
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    if (request.nextUrl.search) throw new InputError("Unexpected input");
    return communityReply({ ok: true, ...await listMemberCommunities(db, token) });
  });
}
