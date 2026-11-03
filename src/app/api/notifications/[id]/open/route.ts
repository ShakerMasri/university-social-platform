import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { notificationTarget } from "@/server/notifications/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return communityHTTP(request, async (db, token) => {
    const { id } = await params, body = await communityBody(request, 1024);
    validInput(() => { communityId(id); if (Object.keys(body).length) throw new Error("Unexpected input"); });
    return communityReply({ ok: true, ...await notificationTarget(db, token, id, true) });
  });
}
