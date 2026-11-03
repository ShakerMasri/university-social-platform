import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { markAllNotificationsRead } from "@/server/notifications/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const body = await communityBody(request, 1024);
    validInput(() => { if (Object.keys(body).length) throw new Error("Unexpected input"); });
    await markAllNotificationsRead(db, token);
    return communityReply({ ok: true });
  });
}
