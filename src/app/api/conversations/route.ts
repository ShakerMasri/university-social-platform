import type { NextRequest } from "next/server";
import { communityReply, cursor } from "@/server/communities/http";
import { messagingHTTP } from "@/server/messaging/http";
import { listConversations } from "@/server/messaging/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return messagingHTTP(request, async (db, token) => communityReply(await listConversations(db, token, cursor(request))));
}
