import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { sessionInTransaction } from "../identity/service.ts";
import { digest } from "../identity/policy.ts";
import { communityId, communityInput, communityPageSize, membershipInput } from "./policy.ts";

export class CommunityError extends Error {
  constructor(public readonly status: 401 | 403 | 404 | 409 | 429) { super("Community operation unavailable"); }
}
type Transaction = Prisma.TransactionClient;
async function actor(tx: Transaction, token: unknown, requireProfile = false) {
  const access = await sessionInTransaction(tx, token);
  if (!access) throw new CommunityError(401);
  if (requireProfile && !access.session.user.profile) throw new CommunityError(403);
  return access.session.userId;
}
function authorized<T>(db: PrismaClient, token: unknown, run: (tx: Transaction, userId: string) => Promise<T>, requireProfile = false) {
  return db.$transaction(async (tx) => {
    const userId = await actor(tx, token, requireProfile);
    const result = await run(tx, userId);
    // Session revocation waits for our row lock; expiry can advance while a
    // community lock is awaited. Recheck database time before committing/delivery.
    await actor(tx, token, requireProfile);
    return result;
  });
}
async function mutating<T>(db: PrismaClient, token: unknown, run: (tx: Transaction, userId: string) => Promise<T>, requireProfile = false, budget = "m3-community-write") {
  // Reserve attempts separately: a rejected write cannot roll back its budget.
  // Reuse the existing bounded counter table under a disjoint opaque user key.
  const allowed = await authorized(db, token, async (tx, userId) => {
    const keyDigest = digest(`${budget}:${userId}`);
    await tx.identityRateLimit.upsert({ where: { keyDigest }, create: { keyDigest }, update: { hits: { increment: 0 } } });
    const [counter] = await tx.$queryRaw<{ startedAt: Date; hits: number }[]>`SELECT "startedAt", hits FROM "IdentityRateLimit" WHERE "keyDigest" = ${keyDigest} FOR UPDATE`;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const reset = clock.now.getTime() - counter.startedAt.getTime() >= 15 * 60 * 1000;
    if (!reset && counter.hits >= 30) return false;
    await tx.identityRateLimit.update({ where: { keyDigest }, data: { hits: reset ? 1 : counter.hits + 1, ...(reset ? { startedAt: clock.now } : {}) } });
    return true;
  }, requireProfile);
  if (!allowed) throw new CommunityError(429);
  return authorized(db, token, run, requireProfile);
}
async function lockedCommunity(tx: Transaction, id: string, write: boolean) {
  // Prisma 7 has no row-lock query option. Transaction-scoped advisory locks
  // serialize membership writes against reads without granting Community UPDATE.
  // Parameters are bound; a hash collision only serializes unrelated spaces.
  if (write) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}::text, 0))::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${id}::text, 0))::text`;
  const community = await tx.community.findUnique({ where: { id } });
  if (!community) throw new CommunityError(404);
  return community;
}

export function createCommunity(db: PrismaClient, token: unknown, input: Record<string, unknown>) {
  const data = communityInput(input);
  return mutating(db, token, async (tx, ownerId) => {
    // A per-user advisory lock enforces the local resource cap across sessions.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`community-budget:${ownerId}`}::text, 0))::text`;
    if (await tx.community.count({ where: { ownerId } }) >= 50) throw new CommunityError(429);
    if (await tx.communityMembership.count({ where: { userId: ownerId } }) >= 500) throw new CommunityError(429);
    const community = await tx.community.create({ data: { ...data, ownerId,
      memberships: { create: { userId: ownerId, status: "MEMBER" } } }, select: { id: true } });
    return community;
  }, true);
}

export function discoverCommunities(db: PrismaClient, token: unknown, cursor?: unknown) {
  const after = cursor === undefined ? undefined : communityId(cursor);
  return authorized(db, token, async (tx, userId) => {
    // Only the approved discovery projection; never member counts or identities.
    const rows = await tx.community.findMany({ where: after ? { id: { gt: after } } : undefined,
      orderBy: { id: "asc" }, take: communityPageSize + 1,
      select: { id: true, name: true, description: true, visibility: true, ownerId: true,
        memberships: { where: { userId }, select: { status: true } } } });
    const items = rows.slice(0, communityPageSize).map(({ ownerId, memberships, ...community }) => ({ ...community,
      isOwner: ownerId === userId, membership: memberships[0]?.status ?? null }));
    return { items, next: rows.length > communityPageSize ? items.at(-1)!.id : null,
      canCreate: Boolean(await tx.profile.findUnique({ where: { userId }, select: { userId: true } })) };
  });
}

export function readCommunity(db: PrismaClient, token: unknown, value: unknown) {
  const id = communityId(value);
  return authorized(db, token, async (tx, userId) => {
    const community = await lockedCommunity(tx, id, false);
    const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId } }, select: { status: true } });
    const isOwner = community.ownerId === userId;
    if (community.visibility === "PRIVATE" && !isOwner && membership?.status !== "MEMBER") throw new CommunityError(404);
    return { id, name: community.name, description: community.description, visibility: community.visibility,
      isOwner, membership: membership?.status ?? null };
  });
}

export function listMemberships(db: PrismaClient, token: unknown, value: unknown, cursor?: unknown) {
  const id = communityId(value), after = cursor === undefined ? undefined : communityId(cursor);
  return authorized(db, token, async (tx, userId) => {
    const community = await lockedCommunity(tx, id, false);
    if (community.ownerId !== userId) throw new CommunityError(403);
    const rows = await tx.communityMembership.findMany({ where: { communityId: id, ...(after ? { userId: { gt: after } } : {}) },
      orderBy: { userId: "asc" }, take: communityPageSize + 1,
      select: { userId: true, status: true, user: { select: { profile: { select: { displayName: true } } } } } });
    const items = rows.slice(0, communityPageSize).map((row) => ({ userId: row.userId, status: row.status,
      displayName: row.user.profile?.displayName ?? null, isOwner: row.userId === userId }));
    return { items, next: rows.length > communityPageSize ? items.at(-1)!.userId : null };
  });
}

export function changeMembership(db: PrismaClient, token: unknown, value: unknown, input: Record<string, unknown>) {
  const id = communityId(value), command = membershipInput(input);
  return mutating(db, token, async (tx, userId) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`community-budget:${userId}`}::text, 0))::text`;
    const community = await lockedCommunity(tx, id, true);
    if (command.action === "approve" || command.action === "remove") {
      if (community.ownerId !== userId) throw new CommunityError(403);
      if (command.userId === community.ownerId) throw new CommunityError(409);
      const where = { communityId: id, userId: command.userId! };
      if (command.action === "approve") {
        const current = await tx.communityMembership.findUnique({ where: { communityId_userId: where } });
        if (!current) throw new CommunityError(404); // Approval cannot invent a request.
        if (current.status === "PENDING") await tx.communityMembership.update({ where: { communityId_userId: where }, data: { status: "MEMBER" } });
      } else await tx.communityMembership.deleteMany({ where }); // Includes rejecting a pending request.
      return;
    }
    if (community.ownerId === userId) {
      if (command.action === "leave") throw new CommunityError(409);
      return;
    }
    const where = { communityId: id, userId };
    if (command.action === "leave") { await tx.communityMembership.deleteMany({ where }); return; }
    // Serialize all transitions per community. Repeated requests preserve MEMBER
    // status, and never downgrade an approved private member to PENDING.
    if (await tx.communityMembership.findUnique({ where: { communityId_userId: where } })) return;
    if (await tx.communityMembership.count({ where: { userId } }) >= 500) throw new CommunityError(429);
    await tx.communityMembership.create({ data: { ...where, status: community.visibility === "PUBLIC" ? "MEMBER" : "PENDING" } });
  });
}

// Posts share the same session/clock and community-lock boundaries as membership
// changes. Reads hold a shared lock; posting and membership transitions serialize.
export function withCommunityPostAccess<T>(db: PrismaClient, token: unknown, value: unknown, write: boolean,
  run: (tx: Transaction, community: { id: string; ownerId: string; visibility: "PUBLIC" | "PRIVATE" }, userId: string, member: boolean) => Promise<T>, budget = "m3-post-write", requirePrivateMembership = false) {
  const id = communityId(value);
  const execute = async (tx: Transaction, userId: string) => {
    const community = await lockedCommunity(tx, id, write);
    const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId } }, select: { status: true } });
    const member = membership?.status === "MEMBER";
    if (community.visibility === "PRIVATE" && !member && (requirePrivateMembership || community.ownerId !== userId)) throw new CommunityError(404);
    if (write && !member) throw new CommunityError(403);
    return run(tx, community, userId, member);
  };
  return write ? mutating(db, token, execute, true, budget) : authorized(db, token, execute);
}
