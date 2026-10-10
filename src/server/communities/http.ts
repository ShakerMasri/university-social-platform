import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { identityDatabase, requireLocalIdentity } from "../identity/local.ts";
import { sessionCookie } from "../identity/policy.ts";
import { communityId } from "./policy.ts";
import { CommunityError } from "./service.ts";

export const communityReply = (body: object, status = 200) => NextResponse.json(body, { status, headers: {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
} });
export class InputError extends Error {}
export async function communityHTTP(request: NextRequest, handle: (db: PrismaClient, token: unknown) => Promise<NextResponse>) {
  try {
    const { context } = requireLocalIdentity(request.headers);
    if (request.method !== "GET" && request.headers.get("origin") !== context.origin) return communityReply({ ok: false }, 403);
    return await handle(identityDatabase(context), request.cookies.get(sessionCookie)?.value);
  } catch (error) {
    return communityReply({ ok: false }, error instanceof CommunityError ? error.status : error instanceof InputError ? 400 : 503);
  }
}
export function validInput<T>(read: () => T): T {
  try { return read(); } catch { throw new InputError("Invalid input"); }
}
export function cursor(request: NextRequest) {
  const keys = [...request.nextUrl.searchParams.keys()];
  if (keys.some((key) => key !== "after") || keys.length > 1) throw new InputError("Invalid cursor");
  const value = request.nextUrl.searchParams.get("after");
  return value === null ? undefined : validInput(() => communityId(value));
}
export async function communityBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (request.nextUrl.search || !request.headers.get("content-type")?.startsWith("application/json")) throw new InputError("Invalid input");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Invalid input");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new InputError("Input too large"); }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Invalid input");
    return body as Record<string, unknown>;
  } catch { throw new InputError("Invalid input"); }
  finally { reader.releaseLock(); }
}
