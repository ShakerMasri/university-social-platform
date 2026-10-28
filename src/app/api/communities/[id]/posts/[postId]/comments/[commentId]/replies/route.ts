import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { listComments } from "@/server/comments/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: Promise<{ id: string; postId: string; commentId: string }> }) {
  return communityHTTP(request, async (db, token) => {
    const { id, postId, commentId } = await params;
    validInput(() => { communityId(id); communityId(postId); communityId(commentId); });
    return communityReply({ ok: true, ...await listComments(db, token, id, postId, cursor(request), commentId) });
  });
}
