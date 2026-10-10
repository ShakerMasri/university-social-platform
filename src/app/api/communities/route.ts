import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { communityInput } from "@/server/communities/policy";
import { createCommunity, discoverCommunities } from "@/server/communities/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => communityReply({ ok: true, ...await discoverCommunities(db, token, cursor(request)) }));
}
export function POST(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const body = await communityBody(request);
    validInput(() => communityInput(body));
    return communityReply({ ok: true, ...await createCommunity(db, token, body) }, 201);
  });
}
