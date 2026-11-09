import type { NextRequest } from "next/server";
import { communityReply, cursor, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { messagingBody, messagingHTTP } from "@/server/messaging/http";
import { messageInput } from "@/server/messaging/policy";
import { readMessages, sendMessage } from "@/server/messaging/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: NextRequest, { params }: Context) {
  return messagingHTTP(request, async (db, token) => {
    const { id } = await params;
    return communityReply(await readMessages(db, token, validInput(() => communityId(id)), cursor(request)));
  });
}
export function POST(request: NextRequest, { params }: Context) {
  return messagingHTTP(request, async (db, token) => {
    const { id } = await params, body = await messagingBody(request);
    return communityReply(await sendMessage(db, token, validInput(() => communityId(id)), validInput(() => messageInput(body))));
  });
}
