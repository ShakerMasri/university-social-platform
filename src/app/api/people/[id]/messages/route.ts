import type { NextRequest } from "next/server";
import { communityReply, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { messagingBody, messagingHTTP } from "@/server/messaging/http";
import { messageInput } from "@/server/messaging/policy";
import { contactPerson } from "@/server/messaging/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return messagingHTTP(request, async (db, token) => {
    const { id } = await params, body = await messagingBody(request);
    return communityReply(await contactPerson(db, token, validInput(() => communityId(id)), validInput(() => messageInput(body))));
  });
}
