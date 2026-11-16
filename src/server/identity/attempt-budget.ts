import "server-only";
import type { Prisma } from "../../generated/prisma/client.ts";
import { digest } from "./policy.ts";

const userAttemptLimit = 30;
const userAttemptWindowMilliseconds = 15 * 60 * 1000;

// The caller authenticates before/after this reservation and commits it in a
// separate transaction so a later rejected operation cannot erase its budget.
export async function consumeUserAttempt(tx: Prisma.TransactionClient, userId: string, budget: string) {
  const keyDigest = digest(`${budget}:${userId}`);
  await tx.identityRateLimit.upsert({ where: { keyDigest }, create: { keyDigest }, update: { hits: { increment: 0 } } });
  const [counter] = await tx.$queryRaw<{ startedAt: Date; hits: number }[]>`SELECT "startedAt", hits FROM "IdentityRateLimit" WHERE "keyDigest" = ${keyDigest} FOR UPDATE`;
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const reset = clock.now.getTime() - counter.startedAt.getTime() >= userAttemptWindowMilliseconds;
  if (!reset && counter.hits >= userAttemptLimit) return false;
  await tx.identityRateLimit.update({ where: { keyDigest }, data: { hits: reset ? 1 : counter.hits + 1, ...(reset ? { startedAt: clock.now } : {}) } });
  return true;
}
