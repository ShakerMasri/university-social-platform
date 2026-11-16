import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { directoryProfileInput } from "@/server/profiles/policy";
import { saveDirectoryProfile } from "@/server/profiles/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PUT(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const body = await communityBody(request, 2048);
    const data = validInput(() => directoryProfileInput(body));
    await saveDirectoryProfile(db, token, data);
    return communityReply({ ok: true });
  }, "profiles.http.failed");
}
