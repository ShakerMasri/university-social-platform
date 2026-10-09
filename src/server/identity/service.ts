import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { validateDisplayName } from "../database/validation.ts";
import { challengeLifetime, sessionLifetime, digest, eligibleEmail, ipLimit, ipWindow, keyedDigest, newToken, tokenValid } from "./policy.ts";

type Transaction = Prisma.TransactionClient;
type IdentityOptions = { rateKey: string; domains?: readonly string[]; ipReserved?: boolean };
export type Delivery = (message: { email: string; token: string; expiresAt: Date }) => Promise<void>;

async function time(tx: Transaction) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}

async function lockCounter(tx: Transaction, keyDigest: string) {
  await tx.identityRateLimit.upsert({
    where: { keyDigest }, create: { keyDigest }, update: { hits: { increment: 0 } },
  });
  const [row] = await tx.$queryRaw<{ startedAt: Date; hits: number }[]>`
    SELECT "startedAt", hits FROM "IdentityRateLimit" WHERE "keyDigest" = ${keyDigest} FOR UPDATE`;
  return row;
}

export async function allowIP(db: PrismaClient, options: IdentityOptions, ip: string, operation: "request" | "confirm") {
  const keyDigest = keyedDigest(options.rateKey, `ip:${operation}:${ip}`);
  return db.$transaction(async (tx) => {
    const counter = await lockCounter(tx, keyDigest);
    const now = await time(tx);
    const reset = now.getTime() - counter.startedAt.getTime() >= ipWindow;
    if (!reset && counter.hits >= ipLimit) return false;
    await tx.identityRateLimit.update({ where: { keyDigest },
      data: { hits: reset ? 1 : counter.hits + 1, ...(reset ? { startedAt: now } : {}) } });
    return true;
  });
}

// Email limits are rolling windows over issued challenges, serialized on a
// keyed email lock. IP attempts (including malformed/ineligible input) are
// committed separately, so a failed issuance cannot erase its IP reservation.
export async function requestSignIn(db: PrismaClient, options: IdentityOptions, input: {
  email: unknown; browser: string; ip: string;
}, deliver: Delivery) {
  if (!options.ipReserved && !await allowIP(db, options, input.ip, "request")) return;
  let address: ReturnType<typeof eligibleEmail>;
  try { address = eligibleEmail(input.email, options.domains); } catch { return; }
  if (!tokenValid(input.browser)) return;
  const token = newToken();
  const issued = await db.$transaction(async (tx) => {
    await lockCounter(tx, keyedDigest(options.rateKey, `email:${address.emailKey}`));
    const user = await tx.user.upsert({ where: { emailKey: address.emailKey }, create: address, update: {} });
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
    const now = await time(tx);
    const recent = await tx.emailOwnershipChallenge.findMany({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 86400000) } },
      select: { createdAt: true },
    });
    if (recent.some((row) => now.getTime() - row.createdAt.getTime() < 60000) ||
        recent.filter((row) => now.getTime() - row.createdAt.getTime() < 3600000).length >= 5 || recent.length >= 10) return null;
    await tx.emailOwnershipChallenge.updateMany({
      where: { userId: user.id, consumedAt: null, revokedAt: null }, data: { revokedAt: now },
    });
    const challenge = await tx.emailOwnershipChallenge.create({ data: {
      userId: user.id, emailKey: user.emailKey, tokenDigest: digest(token), browserDigest: digest(input.browser),
      createdAt: now, expiresAt: new Date(now.getTime() + challengeLifetime),
    }, select: { id: true, expiresAt: true } });
    return { ...challenge, email: user.email };
  });
  if (!issued) return;
  try {
    // Local memory delivery completes immediately. Bound a malfunctioning adapter
    // too; late delivery cannot revive a revoked challenge.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([deliver({ email: issued.email, token, expiresAt: issued.expiresAt }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Delivery timeout")), 2000); })]);
    } finally { clearTimeout(timeout); }
  } catch {
    await db.$transaction(async (tx) => {
      const now = await time(tx);
      await tx.emailOwnershipChallenge.updateMany({
        where: { id: issued.id, consumedAt: null, revokedAt: null }, data: { revokedAt: now },
      });
    });
    // Generic HTTP result is identical for new/existing/limited/failed requests.
  }
}

export async function confirmInTransaction(tx: Transaction, input: { token: string; browser: string; previousSession?: string }) {
  const candidate = await tx.emailOwnershipChallenge.findUnique({ where: { tokenDigest: digest(input.token) }, select: { id: true, userId: true } });
  if (!candidate) return null;
  // Same user → challenge lock order for issuance/confirmation. Read time after
  // both locks; expiry while waiting must fail, not create a stale session.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "EmailOwnershipChallenge" WHERE id = ${candidate.id}::uuid FOR UPDATE`;
  const now = await time(tx);
  const challenge = await tx.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: candidate.id }, include: { user: true } });
  if (challenge.browserDigest !== digest(input.browser) || challenge.emailKey !== challenge.user.emailKey ||
      challenge.consumedAt || challenge.revokedAt || challenge.createdAt > now || challenge.expiresAt <= now) return null;
  await tx.emailOwnershipChallenge.update({ where: { id: candidate.id }, data: { consumedAt: now } });
  await tx.emailOwnershipChallenge.updateMany({
    where: { userId: candidate.userId, consumedAt: null, revokedAt: null }, data: { revokedAt: now },
  });
  if (!challenge.user.emailVerifiedAt) await tx.user.update({ where: { id: candidate.userId }, data: { emailVerifiedAt: now } });
  if (input.previousSession && tokenValid(input.previousSession)) await tx.session.updateMany({
    where: { tokenDigest: digest(input.previousSession), revokedAt: null }, data: { revokedAt: now },
  });
  const token = newToken();
  const session = await tx.session.create({ data: {
    userId: candidate.userId, tokenDigest: digest(token), createdAt: now, expiresAt: new Date(now.getTime() + sessionLifetime),
  }, select: { expiresAt: true } });
  return { token, expiresAt: session.expiresAt };
}

export async function confirmSignIn(db: PrismaClient, options: IdentityOptions, input: {
  token: unknown; browser: unknown; ip: string; previousSession?: string;
}) {
  if ((!options.ipReserved && !await allowIP(db, options, input.ip, "confirm")) || !tokenValid(input.token) || !tokenValid(input.browser)) return null;
  const token = input.token, browser = input.browser;
  return db.$transaction((tx) => confirmInTransaction(tx, { token, browser, previousSession: input.previousSession }));
}

async function sessionInTransaction(tx: Transaction, token: unknown) {
  if (!tokenValid(token)) return null;
  const candidate = await tx.session.findUnique({ where: { tokenDigest: digest(token) }, select: { userId: true } });
  if (!candidate) return null;
  // Account before session, as in confirmation. A first profile insert needs
  // an account FK lock; taking the session first could deadlock with a login
  // that holds the account while revoking that same session.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId}::uuid FOR KEY SHARE`;
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Session" WHERE "tokenDigest" = ${digest(token)} FOR UPDATE`;
  if (!locked) return null;
  const now = await time(tx);
  const session = await tx.session.findUniqueOrThrow({ where: { id: locked.id }, include: { user: { include: { profile: true } } } });
  if (session.revokedAt || session.createdAt > now || session.expiresAt <= now || !session.user.emailVerifiedAt) return null;
  return { session, now };
}

export function ownProfile(db: PrismaClient, token: unknown) {
  return db.$transaction(async (tx) => {
    const access = await sessionInTransaction(tx, token);
    return access ? { email: access.session.user.email, displayName: access.session.user.profile?.displayName ?? null } : null;
  });
}

export function updateOwnProfile(db: PrismaClient, token: unknown, name: unknown) {
  const displayName = validateDisplayName(name);
  return db.$transaction(async (tx) => {
    const access = await sessionInTransaction(tx, token);
    if (!access) return false;
    const userId = access.session.userId; // Ownership comes only from the live session.
    await tx.profile.upsert({ where: { userId }, create: { userId, displayName }, update: { displayName } });
    return true;
  });
}

export function logout(db: PrismaClient, token: unknown) {
  return db.$transaction(async (tx) => {
    const access = await sessionInTransaction(tx, token);
    if (!access) return false;
    await tx.session.update({ where: { id: access.session.id }, data: { revokedAt: access.now } });
    return true;
  });
}
