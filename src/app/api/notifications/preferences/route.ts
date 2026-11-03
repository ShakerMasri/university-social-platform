import type { NextRequest } from "next/server";
import { communityBody, communityHTTP, communityReply, cursor, validInput } from "@/server/communities/http";
import { notificationPreferences } from "@/server/notifications/policy";
import { readPreferences, savePreferences } from "@/server/notifications/preferences";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    validInput(() => { if (cursor(request) !== undefined) throw new Error("Unexpected cursor"); });
    return communityReply({ ok: true, ...await readPreferences(db, token) });
  });
}
export function PUT(request: NextRequest) {
  return communityHTTP(request, async (db, token) => {
    const body = await communityBody(request, 1024); validInput(() => notificationPreferences(body));
    return communityReply({ ok: true, ...await savePreferences(db, token, body) });
  });
}
