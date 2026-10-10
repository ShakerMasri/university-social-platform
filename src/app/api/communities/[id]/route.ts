import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, InputError, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { readCommunity } from "@/server/communities/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return communityHTTP(request, async (db, token) => {
    if (request.nextUrl.search) throw new InputError("Invalid input");
    const { id } = await params;
    validInput(() => communityId(id));
    return communityReply({ ok: true, ...await readCommunity(db, token, id) });
  });
}
