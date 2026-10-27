import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { commentInput, commentRequestBytes } from "@/server/comments/policy";
import { createComment, listComments } from "@/server/comments/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; postId: string }> };
export function GET(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id, postId } = await params;
    validInput(() => { communityId(id); communityId(postId); });
    return communityReply({ ok: true, ...await listComments(db, token, id, postId, cursor(request)) });
  });
}
export function POST(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id, postId } = await params, body = await communityBody(request, commentRequestBytes);
    validInput(() => { communityId(id); communityId(postId); commentInput(body); });
    return communityReply({ ok: true, ...await createComment(db, token, id, postId, body) }, 201);
  });
}
