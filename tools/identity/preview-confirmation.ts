import type { IncomingMessage, ServerResponse } from "node:http";
import { normalizeEmail } from "../../src/server/database/validation.ts";
import { digest, pendingCookie, tokenValid, syntheticDomain } from "../../src/server/identity/policy.ts";
import type { LocalIdentity } from "../../src/server/identity/local.ts";

// This handler is installed only by the explicit preview launcher. It is not a
// Next route, never runs in ordinary startup, and exposes no mailbox listing.
export async function previewConfirmation(request: IncomingMessage, response: ServerResponse, context: LocalIdentity) {
  const reply = (status: number, body: object) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(JSON.stringify(body)); };
  if (context.mode !== "preview") { reply(404, { ok: false }); return; }
  if (request.url !== "/__local-preview/confirmation") { reply(400, { ok: false }); return; }
  if (request.method !== "POST") { reply(405, { ok: false }); return; }
  if (request.headers.origin !== context.origin) { reply(403, { ok: false }); return; }
  if (!request.headers["content-type"]?.startsWith("application/json")) { reply(400, { ok: false }); return; }
  try {
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 2048) { request.resume(); reply(400, { ok: false }); return; }
      chunks.push(bytes);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "email") || !("email" in input)) { reply(400, { ok: false }); return; }
    const { emailKey } = normalizeEmail(input.email);
    const cookies = (request.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${pendingCookie}=`));
    const pending = cookies.length === 1 ? cookies[0].slice(pendingCookie.length + 1) : undefined;
    if (!emailKey.endsWith(`@${syntheticDomain}`) || !tokenValid(pending)) { reply(400, { ok: false }); return; }
    const message = context.mailbox.get(emailKey);
    if (!message || message.expiresAt.getTime() <= Date.now()) { reply(400, { ok: false }); return; }
    let challenge: { id: string } | null;
    try { challenge = await context.database.emailOwnershipChallenge.findFirst({ where: {
      emailKey, tokenDigest: digest(message.token), browserDigest: digest(pending), consumedAt: null, revokedAt: null,
      expiresAt: { gt: new Date() },
    }, select: { id: true } }); } catch {
      console.error(JSON.stringify({ level: "error", event: "preview.confirmation_failed" }));
      reply(503, { ok: false }); return;
    }
    if (!challenge) { reply(400, { ok: false }); return; }
    // Synthetic bearer value is returned only to its requesting browser over
    // this loopback-only, origin/host/pending-cookie guarded development channel.
    // It is never logged, rendered as a link, persisted or consumed here.
    reply(200, { token: message.token });
  } catch {
    // Invalid input and operational errors have no credential-bearing detail.
    reply(400, { ok: false });
  }
}
