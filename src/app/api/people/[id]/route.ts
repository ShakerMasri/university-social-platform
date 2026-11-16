import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, InputError, validInput } from "@/server/communities/http";
import { communityId } from "@/server/communities/policy";
import { readDirectoryProfile } from "@/server/profiles/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return communityHTTP(request, async (db, token) => {
    if (request.nextUrl.search) throw new InputError("Invalid profile parameters");
    const { id } = await params;
    return communityReply(await readDirectoryProfile(db, token, validInput(() => communityId(id))));
  }, "profiles.http.failed");
}
