import { NextRequest, NextResponse } from "next/server";
import { reportOperationalFailure } from "@/server/diagnostics";
import { isLocale } from "@/i18n/locales";
import { identityDatabase, requireLocalIdentity } from "@/server/identity/local";
import { cookieOptions, newToken, pendingCookie, sessionCookie, syntheticDomain, tokenValid } from "@/server/identity/policy";
import { allowIP, confirmSignIn, logout, ownProfile, requestSignIn, updateOwnProfile } from "@/server/identity/service";
import { normalizeEmail, validateDisplayName } from "@/server/database/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
} });
type Params = { params: Promise<{ operation: string }> };

async function input(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Invalid input");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid input");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new Error("Input too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid input");
  return body as Record<string, unknown>;
}

export async function GET(request: NextRequest, { params }: Params) {
  let enabled = false;
  try {
    const { context } = requireLocalIdentity(request.headers);
    enabled = true;
    if ((await params).operation !== "profile" || request.nextUrl.search) return reply({ ok: false }, 404);
    const profile = await ownProfile(await identityDatabase(context), request.cookies.get(sessionCookie)?.value);
    return profile ? reply({ ok: true, ...profile }) : reply({ ok: false }, 401);
  } catch {
    if (enabled) reportOperationalFailure("identity.http.get_failed");
    return reply({ ok: false }, 503);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  let enabled = false;
  try {
    const { context, ip } = requireLocalIdentity(request.headers);
    enabled = true;
    // Cookie auth and login/pending state both need CSRF protection. No CORS or
    // permissive forwarded-host/proxy exception is configured in this local flow.
    if (request.headers.get("origin") !== context.origin || request.nextUrl.search) return reply({ ok: false }, 403);
    const operation = (await params).operation;
    if (!["request", "confirm", "profile", "logout"].includes(operation)) return reply({ ok: false }, 404);
    const db = await identityDatabase(context);
    const options = { rateKey: context.rateKey, domains: [syntheticDomain], ipReserved: true };
    if ((operation === "request" || operation === "confirm") && !await allowIP(db, options, ip, operation)) {
      const response = reply({ ok: operation === "request" }, operation === "request" ? 202 : 400);
      if (operation === "request") {
        const existing = request.cookies.get(pendingCookie)?.value;
        response.cookies.set(pendingCookie, tokenValid(existing) ? existing : newToken(), { ...cookieOptions(), maxAge: 600 });
      }
      return response;
    }
    let body: Record<string, unknown>;
    try { body = await input(request); } catch { return reply({ ok: false }, 400); }
    const allowed = operation === "request" ? ["email", "locale"] : operation === "confirm" ? ["token", "locale"] : operation === "profile" ? ["displayName"] : [];
    if (Object.keys(body).some((key) => !allowed.includes(key))) return reply({ ok: false }, 400);
    if (operation === "request") {
      if (!isLocale(body.locale)) return reply({ ok: false }, 400);
      const existing = request.cookies.get(pendingCookie)?.value;
      const browser = tokenValid(existing) ? existing : newToken();
      await requestSignIn(db, options, { email: body.email, browser, ip }, async (message) => {
        // The mailbox belongs to the separate authenticated test control channel.
        // Raw tokens never reach this application's response, files or logs.
        for (const [email, stored] of context.mailbox) if (stored.expiresAt.getTime() <= Date.now()) context.mailbox.delete(email);
        if (context.mailbox.size >= 1000) throw new Error("Test mailbox full");
        context.mailbox.set(normalizeEmail(message.email).emailKey, { token: message.token, expiresAt: message.expiresAt });
      });
      const response = reply({ ok: true }, 202);
      response.cookies.set(pendingCookie, browser, { ...cookieOptions(), maxAge: 600 });
      return response;
    }
    if (operation === "confirm") {
      if (!isLocale(body.locale)) return reply({ ok: false }, 400);
      const session = await confirmSignIn(db, options, { token: body.token, browser: request.cookies.get(pendingCookie)?.value,
        previousSession: request.cookies.get(sessionCookie)?.value, ip });
      if (!session) return reply({ ok: false }, 400);
      const response = reply({ ok: true });
      response.cookies.set(sessionCookie, session.token, { ...cookieOptions(), expires: session.expiresAt });
      response.cookies.set(pendingCookie, "", { ...cookieOptions(), maxAge: 0 });
      return response;
    }
    const token = request.cookies.get(sessionCookie)?.value;
    if (operation === "profile") {
      try { validateDisplayName(body.displayName); } catch { return reply({ ok: false }, 400); }
      const success = await updateOwnProfile(db, token, body.displayName);
      return reply({ ok: success }, success ? 200 : 401);
    }
    // False means the database authoritatively found no eligible live session.
    // Logout is idempotent in that case. An access/revocation/commit exception
    // still reaches the 503 handler without clearing cookies or claiming success.
    await logout(db, token);
    const response = reply({ ok: true });
    response.cookies.set(sessionCookie, "", { ...cookieOptions(), maxAge: 0 });
    response.cookies.set(pendingCookie, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch {
    if (enabled) reportOperationalFailure("identity.http.post_failed");
    return reply({ ok: false }, 503);
  }
}
