import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { normalizeEmail, validateUserId } from "./validation.ts";

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function databaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  // Trusted static SQL obtains the database clock, not caller-controlled time.
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}

export async function createEmailChallenge(db: PrismaClient, userId: unknown, expiresAt: Date) {
  validateUserId(userId);
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error("Invalid expiry");
  }
  const token = randomBytes(32).toString("base64url");
  const challenge = await db.$transaction(async (tx) => {
    const now = await databaseTime(tx);
    if (expiresAt <= now) throw new Error("Invalid expiry");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return tx.emailOwnershipChallenge.create({
      data: { userId, emailKey: user.emailKey, tokenDigest: digest(token), createdAt: now, expiresAt },
      select: { id: true, expiresAt: true },
    });
  });
  // The token exists only in memory for a future approved delivery adapter. Never log it.
  return { ...challenge, token };
}

export type ChallengeInput = { userId: unknown; email: unknown; token: unknown };

// Exposed internally so callers can compose this transition into a larger transaction.
export async function consumeEmailChallengeInTransaction(tx: Prisma.TransactionClient, input: ChallengeInput) {
  validateUserId(input.userId);
  const { emailKey } = normalizeEmail(input.email);
  if (typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) return false;
  // Sample time only AFTER acquiring the row lock: a pre-lock clock/predicate
  // can become stale during contention. Prisma has no row-lock query API, so
  // this trusted SQL uses parameters for every input; writes use Prisma APIs.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "EmailOwnershipChallenge"
    WHERE "userId" = ${input.userId}::uuid AND "emailKey" = ${emailKey}
      AND "tokenDigest" = ${digest(input.token)}
    FOR UPDATE`;
  if (locked.length !== 1) return false;
  const now = await databaseTime(tx);
  const consumed = await tx.emailOwnershipChallenge.updateMany({
    where: {
      id: locked[0].id, userId: input.userId, emailKey,
      createdAt: { lte: now }, expiresAt: { gt: now }, consumedAt: null, revokedAt: null,
      user: { emailKey, emailVerifiedAt: null },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return false;
  const verified = await tx.user.updateMany({
    where: { id: input.userId, emailKey, emailVerifiedAt: null },
    data: { emailVerifiedAt: now },
  });
  if (verified.count !== 1) throw new Error("Challenge transition could not complete");
  return true;
}

export function consumeEmailChallenge(db: PrismaClient, input: ChallengeInput) {
  return db.$transaction((tx) => consumeEmailChallengeInTransaction(tx, input));
}
