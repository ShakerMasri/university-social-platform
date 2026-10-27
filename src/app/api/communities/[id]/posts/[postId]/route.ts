import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, InputError, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { readPost } from "@/server/posts/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  return communityHTTP(request, async (db, token) => {
    if (request.nextUrl.search) throw new InputError("Invalid input");
    const { id, postId } = await params;
    validInput(() => { communityId(id); communityId(postId); });
    return communityReply({ ok: true, post: await readPost(db, token, id, postId) });
  });
}
