import "server-only";
import type { Prisma } from "../../generated/prisma/client.ts";

// All name writes, including legacy own-profile saves, participate.
// Readers lock bounded candidate user IDs in sorted order before projection.
export async function lockDirectoryProfile(tx: Prisma.TransactionClient, userId: string, write = false) {
  const key = `profile-directory:${userId}`;
  if (write) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}::text, 0))::text`;
}
