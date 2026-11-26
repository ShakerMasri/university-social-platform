import "server-only";
import type { Prisma } from "../../generated/prisma/client.ts";
import { CommunityError } from "../communities/service.ts";
import { digest } from "../identity/policy.ts";

export async function feedMemberships(tx: Prisma.TransactionClient, userId: string) {
  // xmin detects a new incarnation even when leave/rejoin shares a timestamp.
  // It is only a cursor invalidation hint; live MEMBER authorization wins.
  const rows = await tx.$queryRaw<{ communityId: string; createdAt: Date; version: string }[]>`
    SELECT "communityId", "createdAt", xmin::text AS version FROM "CommunityMembership"
    WHERE "userId" = ${userId}::uuid AND status = 'MEMBER' ORDER BY "communityId" LIMIT 501`;
  if (rows.length > 500) throw new CommunityError(429);
  return { ids: rows.map(row => row.communityId), scope: digest(JSON.stringify(rows.map(row => [row.communityId, row.createdAt.toISOString(), row.version]))) };
}
