import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, cursor } from "@/server/communities/http";
import { listNotifications } from "@/server/notifications/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => communityReply({ ok: true, ...await listNotifications(db, token, cursor(request)) }));
}
