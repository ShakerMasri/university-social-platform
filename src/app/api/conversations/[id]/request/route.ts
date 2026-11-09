import type { NextRequest } from "next/server";
import { communityReply, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { messagingBody, messagingHTTP } from "@/server/messaging/http";
import { messageDecisionInput } from "@/server/messaging/policy";
import { decideConversation } from "@/server/messaging/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return messagingHTTP(request, async (db, token) => {
    const { id } = await params, body = await messagingBody(request);
    return communityReply(await decideConversation(db, token, validInput(() => communityId(id)), validInput(() => messageDecisionInput(body))));
  });
}
