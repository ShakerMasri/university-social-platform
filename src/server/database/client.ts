import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { assertDatabaseIdentity, readManifest } from "../../../tools/database/targets.ts";

// Local M1b only. A later deployment needs its own explicit operational configuration.
// Callers choose a target; there is no ambient DATABASE_URL/default PostgreSQL fallback.
export async function createLocalDatabase(connectionString: string) {
  const manifest = readManifest();
  await assertDatabaseIdentity(connectionString, manifest, "runtime");
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  return new PrismaClient({ adapter, log: [] });
}
