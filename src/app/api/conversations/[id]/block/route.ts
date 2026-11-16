import type { NextRequest } from "next/server";
import { communityReply, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { messagingBody, messagingHTTP } from "@/server/messaging/http";
import { messageBlockInput } from "@/server/messaging/policy";
import { blockConversation } from "@/server/messaging/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return messagingHTTP(request, async (db, token) => {
    const { id } = await params, body = await messagingBody(request);
    return communityReply(await blockConversation(db, token, validInput(() => communityId(id)), validInput(() => messageBlockInput(body))));
  });
}
