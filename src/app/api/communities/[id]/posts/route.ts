import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { postInput, postRequestBytes } from "@/server/posts/policy";
import { communityId } from "@/server/communities/policy";
import { createPost, listPosts } from "@/server/posts/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export function GET(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id } = await params;
    validInput(() => communityId(id));
    return communityReply({ ok: true, ...await listPosts(db, token, id, cursor(request)) });
  });
}
export function POST(request: NextRequest, { params }: Params) {
  return communityHTTP(request, async (db, token) => {
    const { id } = await params, body = await communityBody(request, postRequestBytes);
    validInput(() => { communityId(id); postInput(body); });
    return communityReply({ ok: true, ...await createPost(db, token, id, body) }, 201);
  });
}
