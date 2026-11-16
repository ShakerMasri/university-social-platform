import type { NextRequest } from "next/server";
import { communityHTTP, communityReply, validInput } from "@/server/communities/http";
import { requireLocalIdentity } from "@/server/identity/local";
import { peopleInput } from "@/server/profiles/policy";
import { searchPeople } from "@/server/profiles/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return communityHTTP(request, async (db, token) => communityReply(await searchPeople(db, token,
    validInput(() => peopleInput(request.nextUrl.searchParams)), requireLocalIdentity(request.headers).context.rateKey)), "profiles.http.failed");
}
