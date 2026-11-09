import "server-only";
import type { DirectConversation, Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { communityId } from "../communities/policy.ts";
import { reserveAttempt } from "../communities/service.ts";
import { sessionInTransaction } from "../identity/service.ts";
import { digest, tokenValid } from "../identity/policy.ts";
import { lockDirectoryProfile } from "../profiles/locking.ts";
import { canAppendMessage, decideMessageRequest, messageBlockInput, messageInput, messagePageSize, messagePair, pendingMessageLimit } from "./policy.ts";

type Transaction = Prisma.TransactionClient;
type Target = { directoryId: string } | { conversationId: string };
export class MessagingError extends Error {
  constructor(public readonly status: 401 | 403 | 404 | 409) { super("Messaging unavailable"); }
}
const unavailable = () => new MessagingError(404);
const isParticipant = (row: DirectConversation, actorId: string) => row.firstId === actorId || row.secondId === actorId;
const isBlocked = (row: DirectConversation) => row.firstBlocked || row.secondBlocked;

async function clock(tx: Transaction) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
async function sessionCandidate(tx: Transaction, token: unknown) {
  if (typeof token !== "string" || !tokenValid(token)) throw new MessagingError(401);
  const candidate = await tx.session.findUnique({ where: { tokenDigest: digest(token) }, select: { userId: true } });
  if (!candidate) throw new MessagingError(401);
  return candidate.userId;
}
async function liveActor(tx: Transaction, token: unknown) {
  const access = await sessionInTransaction(tx, token);
  if (!access) throw new MessagingError(401);
  if (!access.session.user.profile) throw new MessagingError(403);
  return access.session.userId;
}
async function lockAccount(tx: Transaction, id: string) {
  // SHARE also blocks verification-changing non-key UPDATE. Acquire accounts
  // before the session, matching sign-in's account -> session order.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR SHARE`;
}
async function pairLock(tx: Transaction, firstId: string, secondId: string) {
  // Prisma 7 has no advisory-lock API. Values are bound; hash collisions merely
  // serialize unrelated pairs. Every pair read/mutation uses this same lock.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`direct-pair:${firstId}:${secondId}`}::text, 0))::text`;
}
async function verifiedProfiles(tx: Transaction, firstId: string, secondId: string) {
  for (const id of [firstId, secondId]) await lockDirectoryProfile(tx, id);
  const accounts = await tx.user.findMany({ where: { id: { in: [firstId, secondId] }, emailVerifiedAt: { not: null }, profile: { isNot: null } }, select: { id: true } });
  if (accounts.length !== 2) throw unavailable();
}

// Callers cannot supply
// actor IDs, original recipient, request state, counts or block ownership.
async function withPair<T>(db: PrismaClient, token: unknown, target: Target,
  run: (tx: Transaction, actorId: string, pair: { firstId: string; secondId: string }, row: DirectConversation | null) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '4000', true)`;
    const actorId = await sessionCandidate(tx, token);
    let otherId: string;
    if ("directoryId" in target) {
      const profile = await tx.profile.findUnique({ where: { directoryId: target.directoryId }, select: { userId: true } });
      if (!profile || profile.userId === actorId) throw unavailable();
      otherId = profile.userId;
    } else {
      const row = await tx.directConversation.findUnique({ where: { id: target.conversationId } });
      if (!row || !isParticipant(row, actorId)) throw unavailable();
      otherId = row.firstId === actorId ? row.secondId : row.firstId;
    }
    const pair = messagePair(actorId, otherId);
    for (const id of [pair.firstId, pair.secondId]) await lockAccount(tx, id);
    await liveActor(tx, token);
    await pairLock(tx, pair.firstId, pair.secondId);
    const row = await tx.directConversation.findUnique({ where: { firstId_secondId: pair } });
    if ("conversationId" in target && row?.id !== target.conversationId) throw unavailable();
    const result = await run(tx, actorId, pair, row);
    // Throw after lock waits/writes so expiry rolls back the complete mutation.
    await liveActor(tx, token);
    return result;
  });
}
async function append(tx: Transaction, actorId: string, pair: { firstId: string; secondId: string },
  row: DirectConversation | null, input: ReturnType<typeof messageInput>) {
  await verifiedProfiles(tx, pair.firstId, pair.secondId);
  if (row && (isBlocked(row) || row.state === "REJECTED" || (row.state === "PENDING" && row.initiatorId !== actorId))) throw new MessagingError(403);
  const conversation = row ?? await tx.directConversation.create({ data: { ...pair, initiatorId: actorId, pendingMessages: 1 } });
  const submissionKey = digest(`m4-message:${conversation.id}:${actorId}:${input.requestId}`);
  // Live account/session/block/request authorization precedes retry lookup;
  // the pending cap applies only to new writes, including concurrent fifths.
  const existing = await tx.directMessage.findUnique({ where: { submissionKey } });
  if (existing) {
    if (existing.body !== input.body) throw new MessagingError(409);
    return { conversationId: conversation.id, messageId: existing.id };
  }
  if (row && !canAppendMessage(row, actorId, false)) throw new MessagingError(403);
  const message = await tx.directMessage.create({ data: { conversationId: conversation.id, senderId: actorId,
    submissionKey, body: input.body, createdAt: await clock(tx) }, select: { id: true } });
  if (row?.state === "PENDING") await tx.directConversation.update({ where: { id: row.id }, data: { pendingMessages: { increment: 1 } } });
  return { conversationId: conversation.id, messageId: message.id };
}

export async function contactPerson(db: PrismaClient, token: unknown, directoryValue: unknown, value: Record<string, unknown>) {
  const directoryId = communityId(directoryValue), input = messageInput(value);
  await reserveAttempt(db, token, "m4-message-contact", true);
  await reserveAttempt(db, token, "m4-message-send", true);
  return withPair(db, token, { directoryId }, (tx, actor, pair, row) => append(tx, actor, pair, row, input));
}
export async function sendMessage(db: PrismaClient, token: unknown, conversationValue: unknown, value: Record<string, unknown>) {
  const conversationId = communityId(conversationValue), input = messageInput(value);
  await reserveAttempt(db, token, "m4-message-send", true);
  return withPair(db, token, { conversationId }, (tx, actor, pair, row) => append(tx, actor, pair, row, input));
}
export async function decideConversation(db: PrismaClient, token: unknown, conversationValue: unknown, decision: unknown) {
  const conversationId = communityId(conversationValue);
  if (decision !== "accept" && decision !== "reject") throw new Error("Invalid message decision");
  await reserveAttempt(db, token, "m4-message-decision", true);
  return withPair(db, token, { conversationId }, async (tx, actor, pair, row) => {
    if (!row) throw unavailable();
    if (decision === "accept") await verifiedProfiles(tx, pair.firstId, pair.secondId);
    let state: DirectConversation["state"];
    try { state = decideMessageRequest(row, actor, decision, isBlocked(row)); }
    catch { throw new MessagingError(403); }
    await tx.directConversation.update({ where: { id: row.id }, data: { state } });
    return { id: row.id, state };
  });
}
export async function blockConversation(db: PrismaClient, token: unknown, conversationValue: unknown, value: Record<string, unknown>) {
  const conversationId = communityId(conversationValue), { blocked } = messageBlockInput(value);
  await reserveAttempt(db, token, "m4-message-block", true);
  return withPair(db, token, { conversationId }, async (tx, actor, _pair, row) => {
    if (!row) throw unavailable();
    await tx.directConversation.update({ where: { id: row.id }, data: row.firstId === actor ? { firstBlocked: blocked } : { secondBlocked: blocked } });
    return { blockedByMe: blocked };
  });
}

const peerSelect = { emailVerifiedAt: true, profile: { select: { displayName: true, directoryId: true } } } satisfies Prisma.UserSelect;
type Peer = { emailVerifiedAt: Date | null; profile: { displayName: string; directoryId: string } | null };
function conversationProjection(row: DirectConversation, actor: string, peer: Peer) {
  const available = Boolean(peer.emailVerifiedAt && peer.profile);
  const blocked = isBlocked(row), initiatedByMe = row.initiatorId === actor;
  return { id: row.id, state: row.state, initiatedByMe,
    peer: available ? peer.profile : null,
    blockedByMe: row.firstId === actor ? row.firstBlocked : row.secondBlocked,
    contactBlocked: blocked, pendingRemaining: row.state === "PENDING" && initiatedByMe ? pendingMessageLimit - row.pendingMessages : 0,
    canSend: available && canAppendMessage(row, actor, blocked),
    canAccept: available && !initiatedByMe && !blocked && row.state !== "ACCEPTED",
    canReject: !initiatedByMe && row.state === "PENDING" };
}

export async function readMessages(db: PrismaClient, token: unknown, conversationValue: unknown, cursor?: unknown) {
  const conversationId = communityId(conversationValue), after = cursor === undefined ? undefined : communityId(cursor);
  await reserveAttempt(db, token, "m4-message-read", true);
  return withPair(db, token, { conversationId }, async (tx, actor, _pair, row) => {
    if (!row) throw unavailable();
    for (const account of [row.firstId, row.secondId]) await lockDirectoryProfile(tx, account);
    // History stays readable after rejection/block or loss of peer verification.
    const anchor = after ? await tx.directMessage.findFirst({ where: { id: after, conversationId }, select: { createdAt: true, id: true } }) : null;
    if (after && !anchor) throw unavailable();
    const rows = await tx.directMessage.findMany({ where: { conversationId, ...(anchor ? { OR: [
      { createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } },
    ] } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: messagePageSize + 1,
    select: { id: true, body: true, senderId: true, createdAt: true } });
    const items = rows.slice(0, messagePageSize).map(({ senderId, ...message }) => ({ ...message, mine: senderId === actor }));
    const peer = await tx.user.findUniqueOrThrow({ where: { id: row.firstId === actor ? row.secondId : row.firstId }, select: peerSelect });
    const profile = await tx.profile.findUniqueOrThrow({ where: { userId: actor }, select: { directoryId: true } });
    return { items, next: rows.length > messagePageSize ? items.at(-1)!.id : null,
      ...conversationProjection(row, actor, peer), scope: profile.directoryId };
  });
}
export async function listConversations(db: PrismaClient, token: unknown, cursor?: unknown) {
  const after = cursor === undefined ? undefined : communityId(cursor);
  await reserveAttempt(db, token, "m4-message-read", true);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '4000', true)`;
    const actor = await sessionCandidate(tx, token);
    const participant = { OR: [{ firstId: actor }, { secondId: actor }] };
    // Lock the bounded candidate accounts in the same global order as pair
    // operations, before the session. Labels must not outlive a peer's verified
    // profile while this response is being constructed.
    const candidates = await tx.directConversation.findMany({ where: { ...participant, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" }, take: messagePageSize + 1, select: { id: true, firstId: true, secondId: true } });
    const accounts = [...new Set([actor, ...candidates.flatMap(row => [row.firstId, row.secondId])])].sort();
    for (const id of accounts) await lockAccount(tx, id);
    await liveActor(tx, token);
    for (const id of accounts) await lockDirectoryProfile(tx, id);
    if (after && !await tx.directConversation.findFirst({ where: { id: after, ...participant }, select: { id: true } })) throw unavailable();
    // Stable ID order avoids activity reordering between pages. No message
    // previews, private email, internal account IDs or unbounded counts.
    const rows = await tx.directConversation.findMany({ where: { ...participant, id: { in: candidates.map(row => row.id) } },
      orderBy: { id: "asc" }, take: messagePageSize + 1, include: { first: { select: peerSelect }, second: { select: peerSelect } } });
    const items = rows.slice(0, messagePageSize).map(row => conversationProjection(row, actor, row.firstId === actor ? row.second : row.first));
    const profile = await tx.profile.findUniqueOrThrow({ where: { userId: actor }, select: { directoryId: true } });
    await liveActor(tx, token);
    return { items, next: rows.length > messagePageSize ? items.at(-1)!.id : null, scope: profile.directoryId };
  });
}
