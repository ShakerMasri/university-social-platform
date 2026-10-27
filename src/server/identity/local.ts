import "server-only";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { localIdentityOriginValid, type LocalIdentityMode } from "./local-policy.ts";
import { verifyPeer } from "./policy.ts";

// Installed only in memory by the explicitly loopback-only synthetic launcher.
// No environment flag, normal next start, or HTTP request can enable this flow.
export type LocalIdentity = {
  origin: string; mode: LocalIdentityMode; databaseName: string; peerKey: string; rateKey: string;
  mailbox: Map<string, { token: string; expiresAt: Date }>;
  database: PrismaClient;
};
export function localIdentity() {
  return (globalThis as typeof globalThis & { __uspLocalIdentity?: LocalIdentity }).__uspLocalIdentity;
}
export function requireLocalIdentity(headers: Pick<Headers, "get">) {
  const context = localIdentity();
  if (!context || !localIdentityOriginValid(context.origin, context.mode) || context.peerKey.length !== 64 || context.rateKey.length !== 64) {
    throw new Error("Synthetic local identity is disabled");
  }
  return { context, ip: verifyPeer(headers, context.peerKey) };
}
export function identityDatabase(context: LocalIdentity) {
  // The launcher performs manifest/marker/role checks before constructing this
  // client. No operational filesystem or tooling import enters the app bundle.
  return context.database;
}
