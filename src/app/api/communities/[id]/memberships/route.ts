import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { communityId, membershipInput } from "@/server/communities/policy";
import { changeMembership, listMemberships } from "@/server/communities/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export function GET(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id } = await params;
    validInput(() => communityId(id));
    return communityReply({ ok: true, ...await listMemberships(db, token, id, cursor(request)) });
  });
}
export function POST(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id } = await params, body = await communityBody(request);
    validInput(() => { communityId(id); membershipInput(body); });
    await changeMembership(db, token, id, body);
    return communityReply({ ok: true });
  });
}
