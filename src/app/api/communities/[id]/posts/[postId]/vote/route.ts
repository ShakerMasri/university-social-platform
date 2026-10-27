import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { voteInput, voteRequestBytes } from "@/server/votes/policy";
import { setVote } from "@/server/votes/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  return communityHTTP(request, async (db, token) => {
    const { id, postId } = await params, body = await communityBody(request, voteRequestBytes);
    validInput(() => { communityId(id); communityId(postId); voteInput(body); });
    return communityReply({ ok: true, ...await setVote(db, token, id, postId, undefined, body) });
  });
}
