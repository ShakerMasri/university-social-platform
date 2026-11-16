import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { digest, newToken } from "../../src/server/identity/policy";
import { blockConversation, contactPerson, decideConversation, listConversations, readMessages, sendMessage } from "../../src/server/messaging/service";
import { messagePair } from "../../src/server/messaging/policy";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M4_MESSAGING_UPGRADE_DATABASE;
for (const target of [name, upgrade]) if (!manifest.databases.some(row => row.name === target && row.kind === "test" && row.ready)) throw new Error("Owned disposable messaging targets required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
  // Synthetic fixtures deliberately bypass live email, using only this checked
  // disposable target. All service calls below use restricted runtime credentials.
  await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
  if (profile) await db.profile.create({ data: { userId: id, displayName: "Synthetic عضو" } });
  await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 86400000) } });
  const directoryId = (await db.profile.findUnique({ where: { userId: id }, select: { directoryId: true } }))?.directoryId;
  return { id, token, directoryId: directoryId! };
}
const input = (body = "Hello مرحبا 😀 <script>inert</script>") => ({ requestId: randomUUID(), body });
const deny = (result: Promise<unknown>, status: number) => expect(result).rejects.toMatchObject({ status });
async function pair() {
  const a = await actor(), b = await actor();
  const first = input(); const sent = await contactPerson(db, a.token, b.directoryId, first);
  return { a, b, first, ...sent };
}
async function secondSession(user: { id: string; token: string }) {
  const token = newToken();
  await db.session.create({ data: { userId: user.id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 86400000) } });
  return token;
}
async function pairBlocker(a: string, b: string) {
  const client = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await client.connect();
  await client.query("BEGIN"); const p = messagePair(a, b);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [`direct-pair:${p.firstId}:${p.secondId}`]);
  return client;
}
async function waitForQueue(client: Client, count = 1) {
  const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  for (let i = 0; i < 150; i++) {
    const result = await migration.query<{ count: number }>("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))", [pid]);
    if (result.rows[0].count >= count) return;
    await new Promise(done => setTimeout(done, 10));
  }
  throw new Error("Expected real PostgreSQL lock queue");
}
function settled<T>(attempt: Promise<T>) { return attempt.then(value => ({ status: 200, value }), (error: unknown) => ({ status: (error as { status?: number }).status, value: null })); }

describe("M4 local direct messaging on PostgreSQL", () => {
  it("starts without shared membership, keeps one opposite-direction pair and requires explicit recipient acceptance", async () => {
    const a = await actor(), b = await actor(), outsider = await actor();
    const outcomes = await Promise.all([settled(contactPerson(db, a.token, b.directoryId, input("A"))), settled(contactPerson(db, b.token, a.directoryId, input("B")))]);
    expect(outcomes.map(row => row.status).sort()).toEqual([200, 403]);
    const canonical = messagePair(a.id, b.id);
    const rows = await db.directConversation.findMany({ where: canonical }); expect(rows).toHaveLength(1);
    const row = rows[0], initiator = row.initiatorId === a.id ? a : b, recipient = row.initiatorId === a.id ? b : a;
    expect(await db.communityMembership.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(0);
    expect(await db.directMessage.count({ where: { conversationId: row.id } })).toBe(1);
    await deny(sendMessage(db, recipient.token, row.id, input()), 403);
    await deny(decideConversation(db, initiator.token, row.id, "accept"), 403);
    await Promise.all([readMessages(db, outsider.token, row.id), sendMessage(db, outsider.token, row.id, input()),
      decideConversation(db, outsider.token, row.id, "accept"), blockConversation(db, outsider.token, row.id, { blocked: true })].map(operation => deny(operation, 404)));
    expect((await listConversations(db, outsider.token)).items).toEqual([]);
    await decideConversation(db, recipient.token, row.id, "accept");
    await sendMessage(db, recipient.token, row.id, input("Explicitly accepted"));
    expect((await readMessages(db, initiator.token, row.id)).items).toHaveLength(2);
  });
  it("serializes concurrent fifth/sixth messages, reconciles identical retries and conflicts on changed text", async () => {
    const p = await pair();
    for (let i = 0; i < 3; i++) await sendMessage(db, p.a.token, p.conversationId, input());
    const otherToken = await secondSession(p.a), attempts = [input("Fifth A"), input("Fifth B")];
    const result = await Promise.all(attempts.map((body, i) => settled(sendMessage(db, i ? otherToken : p.a.token, p.conversationId, body))));
    expect(result.map(row => row.status).sort()).toEqual([200, 403]);
    const winner = result.findIndex(row => row.status === 200);
    expect(await sendMessage(db, p.a.token, p.conversationId, attempts[winner])).toEqual(result[winner].value);
    expect(await contactPerson(db, p.a.token, p.b.directoryId, p.first)).toEqual({ conversationId: p.conversationId, messageId: p.messageId });
    await deny(sendMessage(db, p.a.token, p.conversationId, { ...attempts[winner], body: "Changed" }), 409);
    expect((await db.directConversation.findUniqueOrThrow({ where: { id: p.conversationId } })).pendingMessages).toBe(5);
    expect(await db.directMessage.count({ where: { conversationId: p.conversationId } })).toBe(5);
  });
  it("reconciles concurrent first-message retries across independent sessions without duplicating the pair or pending slot", async () => {
    const a = await actor(), b = await actor(), anotherToken = await secondSession(a), body = input();
    const results = await Promise.all([contactPerson(db, a.token, b.directoryId, body), contactPerson(db, anotherToken, b.directoryId, body)]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.directConversation.count({ where: messagePair(a.id, b.id) })).toBe(1);
    expect(await db.directMessage.count({ where: { conversationId: results[0].conversationId } })).toBe(1);
    expect((await db.directConversation.findUniqueOrThrow({ where: { id: results[0].conversationId } })).pendingMessages).toBe(1);
  });
  it("rejects recontact and retries, permits later original-recipient acceptance and keeps the same history", async () => {
    const p = await pair();
    await decideConversation(db, p.b.token, p.conversationId, "reject");
    await deny(contactPerson(db, p.a.token, p.b.directoryId, input()), 403);
    await deny(contactPerson(db, p.a.token, p.b.directoryId, p.first), 403);
    await deny(sendMessage(db, p.b.token, p.conversationId, input()), 403);
    expect((await readMessages(db, p.a.token, p.conversationId)).items[0].id).toBe(p.messageId);
    await decideConversation(db, p.b.token, p.conversationId, "accept");
    await decideConversation(db, p.b.token, p.conversationId, "accept");
    await sendMessage(db, p.b.token, p.conversationId, input());
    expect((await listConversations(db, p.a.token)).items[0]).toMatchObject({ id: p.conversationId, state: "ACCEPTED", initiatedByMe: true,
      peer: { directoryId: p.b.directoryId, displayName: "Synthetic عضو" }, canSend: true, canAccept: false, canReject: false });
  });
  it("blocks both send directions and retries, removes only one's own block and allows blocked rejection/history", async () => {
    const p = await pair();
    await blockConversation(db, p.a.token, p.conversationId, { blocked: true });
    await blockConversation(db, p.b.token, p.conversationId, { blocked: true });
    await deny(contactPerson(db, p.a.token, p.b.directoryId, p.first), 403);
    await deny(decideConversation(db, p.b.token, p.conversationId, "accept"), 403);
    await decideConversation(db, p.b.token, p.conversationId, "reject");
    expect((await readMessages(db, p.b.token, p.conversationId)).items).toHaveLength(1);
    await blockConversation(db, p.a.token, p.conversationId, { blocked: false });
    await deny(decideConversation(db, p.b.token, p.conversationId, "accept"), 403);
    expect((await readMessages(db, p.a.token, p.conversationId)).blockedByMe).toBe(false);
    expect((await readMessages(db, p.b.token, p.conversationId)).blockedByMe).toBe(true);
    await blockConversation(db, p.b.token, p.conversationId, { blocked: false });
    await decideConversation(db, p.b.token, p.conversationId, "accept");
    await blockConversation(db, p.a.token, p.conversationId, { blocked: true });
    for (const user of [p.a, p.b]) await deny(sendMessage(db, user.token, p.conversationId, input()), 403);
    await blockConversation(db, p.a.token, p.conversationId, { blocked: false });
    expect(await db.directMessage.count({ where: { conversationId: p.conversationId } })).toBe(1); // No silent resend.
    await sendMessage(db, p.b.token, p.conversationId, input());
  });
  it("denies self, missing/unverified/unsaved targets and revoked/profileless callers without exposing identity fields", async () => {
    const a = await actor(), b = await actor(), unsaved = await actor(false);
    for (const id of [a.directoryId, randomUUID(), unsaved.id]) await deny(contactPerson(db, a.token, id, input()), 404);
    await deny(contactPerson(db, unsaved.token, a.directoryId, input()), 403);
    await migration.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [b.id]);
    await deny(contactPerson(db, a.token, b.directoryId, input()), 404);
    await deny(contactPerson(db, b.token, a.directoryId, input()), 401);
    await db.session.updateMany({ where: { userId: a.id }, data: { revokedAt: new Date() } });
    await deny(contactPerson(db, a.token, b.directoryId, input()), 401);
    await deny(listConversations(db, newToken()), 401);
    expect(await db.directConversation.count({ where: { OR: [{ firstId: a.id }, { secondId: a.id }] } })).toBe(0);
  });
  it("rechecks peer verification and profile on retries/acceptance while retaining readable history", async () => {
    const p = await pair();
    await migration.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [p.b.id]);
    await deny(contactPerson(db, p.a.token, p.b.directoryId, p.first), 404);
    const history = await readMessages(db, p.a.token, p.conversationId);
    expect(history.items).toHaveLength(1); expect(history.peer).toBeNull(); expect(history.canSend).toBe(false);
    expect(history.scope).toBe(p.a.directoryId);
    const listed = (await listConversations(db, p.a.token)).items[0];
    expect(listed.peer).toBeNull(); expect(listed.canSend).toBe(false);
    expect(JSON.stringify(listed)).not.toContain(p.b.id);
    await migration.query('UPDATE "User" SET "emailVerifiedAt"=now() WHERE id=$1', [p.b.id]);
    await migration.query('DELETE FROM "Profile" WHERE "userId"=$1', [p.a.id]);
    await deny(decideConversation(db, p.b.token, p.conversationId, "accept"), 404);
    const missingProfile = await readMessages(db, p.b.token, p.conversationId);
    expect(missingProfile.items).toHaveLength(1); expect(missingProfile.peer).toBeNull(); expect(missingProfile.canAccept).toBe(false);
  });
  it("opens the newest bilingual batch and pages backward without exposing email/account IDs", async () => {
    const p = await pair(), other = await pair();
    await decideConversation(db, p.b.token, p.conversationId, "accept");
    for (let i = 0; i < 20; i++) await sendMessage(db, p.a.token, p.conversationId, input(i === 0 ? "😀".repeat(4000) : `Message ${i} رسالة`));
    const first = await readMessages(db, p.b.token, p.conversationId); expect(first.items).toHaveLength(20); expect(first.next).toBeTruthy();
    const second = await readMessages(db, p.b.token, p.conversationId, first.next); expect(second.items).toHaveLength(1); expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(21);
    expect(first.items.at(-1)!.body).toBe("Message 19 رسالة");
    expect(second.items[0]).toMatchObject({ id: p.messageId, body: p.first.body, mine: false });
    expect(first.next).toBe(first.items[0].id);
    expect(Object.keys(first.items[0]).sort()).toEqual(["body", "createdAt", "id", "mine"]);
    await deny(readMessages(db, p.b.token, p.conversationId, other.messageId), 404);
    await deny(listConversations(db, p.b.token, other.conversationId), 404);
    const connection = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
    try { expect((await readMessages(connection, p.b.token, p.conversationId)).items).toEqual(first.items); }
    finally { await connection.$disconnect(); }
  });
  it("traverses tied message timestamps backward without duplicates or omissions", async () => {
    const p = await pair();
    await decideConversation(db, p.b.token, p.conversationId, "accept");
    for (let i = 0; i < 20; i++) await sendMessage(db, p.a.token, p.conversationId, input(`Tied ${i}`));
    await migration.query('UPDATE "DirectMessage" SET "createdAt"=\'2026-01-01T00:00:00Z\' WHERE "conversationId"=$1', [p.conversationId]);
    const expected = await db.directMessage.findMany({ where: { conversationId: p.conversationId }, orderBy: { id: "asc" }, select: { id: true } });
    const latest = await readMessages(db, p.b.token, p.conversationId);
    const older = await readMessages(db, p.b.token, p.conversationId, latest.next);
    expect(latest.items.map(row => row.id)).toEqual(expected.slice(1).map(row => row.id));
    expect([...older.items, ...latest.items].map(row => row.id)).toEqual(expected.map(row => row.id));
    expect(older.next).toBeNull();
  });
  it("bounds conversation pages to 20 and scopes their anchors to the current participant", async () => {
    const owner = await actor(), ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const recipient = await actor();
      ids.push((await contactPerson(db, owner.token, recipient.directoryId, input())).conversationId);
    }
    const first = await listConversations(db, owner.token); expect(first.items).toHaveLength(20); expect(first.next).toBeTruthy();
    const second = await listConversations(db, owner.token, first.next); expect(second.items).toHaveLength(1); expect(second.next).toBeNull();
    expect([...first.items, ...second.items].map(row => row.id)).toEqual(ids.sort());
    const outsider = await actor(); await deny(listConversations(db, outsider.token, first.next), 404);
  });
  it("keeps independently durable contact/send/read/decision/block budgets, including rejected attempts", async () => {
    const p = await pair();
    for (let i = 0; i < 30; i++) await deny(readMessages(db, p.a.token, randomUUID()), 404);
    await deny(readMessages(db, p.a.token, p.conversationId), 429);
    for (let i = 0; i < 29; i++) await deny(contactPerson(db, p.a.token, randomUUID(), input()), 404);
    await deny(contactPerson(db, p.a.token, p.b.directoryId, input()), 429);
    await deny(sendMessage(db, p.a.token, p.conversationId, input()), 429);
    for (let i = 0; i < 30; i++) await blockConversation(db, p.b.token, p.conversationId, { blocked: true });
    await deny(blockConversation(db, p.b.token, p.conversationId, { blocked: false }), 429);
    for (let i = 0; i < 30; i++) await decideConversation(db, p.b.token, p.conversationId, "reject");
    await deny(decideConversation(db, p.b.token, p.conversationId, "accept"), 429);
    for (const [actorId, budget] of [[p.a.id, "read"], [p.a.id, "contact"], [p.a.id, "send"], [p.b.id, "block"], [p.b.id, "decision"]]) {
      expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-message-${budget}:${actorId}`) } })).hits).toBe(30);
    }
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\' WHERE "keyDigest"=$1', [digest(`m4-message-read:${p.a.id}`)]);
    expect((await readMessages(db, p.a.token, p.conversationId)).items).toHaveLength(1);
  });

  for (const operation of ["block", "reject", "accept"] as const) it(`orders queued ${operation} before the next send on the same pair`, async () => {
    const p = await pair(), lock = await pairBlocker(p.a.id, p.b.id);
    const decision = settled<unknown>(operation === "block" ? blockConversation(db, p.b.token, p.conversationId, { blocked: true }) : decideConversation(db, p.b.token, p.conversationId, operation));
    let sending: ReturnType<typeof settled<Awaited<ReturnType<typeof sendMessage>>>> | undefined;
    try {
      await waitForQueue(lock);
      sending = settled(sendMessage(db, operation === "accept" ? await secondSession(p.b) : p.a.token, p.conversationId, input()));
      await waitForQueue(lock, 2); await lock.query("COMMIT");
      expect((await decision).status).toBe(200);
      expect((await sending).status).toBe(operation === "accept" ? 200 : 403);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await decision; await sending; }
  });
  it("orders a queued send before a later block without erasing that message", async () => {
    const p = await pair(), lock = await pairBlocker(p.a.id, p.b.id);
    const sending = settled(sendMessage(db, p.a.token, p.conversationId, input()));
    let blocking: ReturnType<typeof settled<Awaited<ReturnType<typeof blockConversation>>>> | undefined;
    try {
      await waitForQueue(lock); blocking = settled(blockConversation(db, p.b.token, p.conversationId, { blocked: true }));
      await waitForQueue(lock, 2); await lock.query("COMMIT");
      expect((await sending).status).toBe(200); expect((await blocking).status).toBe(200);
      expect((await readMessages(db, p.b.token, p.conversationId)).items).toHaveLength(2);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await sending; await blocking; }
  });
  it("rolls back first request/message when a live actor expires in a real pair-lock wait", async () => {
    const a = await actor(), b = await actor(), lock = await pairBlocker(a.id, b.id);
    await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'1 second\' WHERE "tokenDigest"=$1', [digest(a.token)]);
    const attempt = settled(contactPerson(db, a.token, b.directoryId, input()));
    try {
      await waitForQueue(lock);
      for (let i = 0; i < 150; i++) {
        if ((await migration.query<{ expired: boolean }>('SELECT "expiresAt"<=clock_timestamp() AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(a.token)])).rows[0].expired) break;
        await new Promise(done => setTimeout(done, 10));
      }
      await lock.query("COMMIT"); expect((await attempt).status).toBe(401);
      expect(await db.directConversation.count({ where: messagePair(a.id, b.id) })).toBe(0);
      expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-message-send:${a.id}`) } })).hits).toBe(1);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await attempt; }
  });
  for (const operation of ["send", "accept", "block", "read"] as const) it(`denies queued ${operation} after actor expiry and preserves prior correspondence`, async () => {
    const p = await pair(), user = operation === "send" || operation === "read" ? p.a : p.b;
    const lock = await pairBlocker(p.a.id, p.b.id);
    await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'1 second\' WHERE "tokenDigest"=$1', [digest(user.token)]);
    const before = await db.directConversation.findUniqueOrThrow({ where: { id: p.conversationId } });
    const attempt = settled<unknown>(operation === "send" ? sendMessage(db, user.token, p.conversationId, input())
      : operation === "accept" ? decideConversation(db, user.token, p.conversationId, "accept")
      : operation === "block" ? blockConversation(db, user.token, p.conversationId, { blocked: true })
      : readMessages(db, user.token, p.conversationId));
    try {
      await waitForQueue(lock);
      for (let i = 0; i < 150; i++) {
        if ((await migration.query<{ expired: boolean }>('SELECT "expiresAt"<=clock_timestamp() AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(user.token)])).rows[0].expired) break;
        await new Promise(done => setTimeout(done, 10));
      }
      await lock.query("COMMIT"); expect((await attempt).status).toBe(401);
      expect(await db.directConversation.findUniqueOrThrow({ where: { id: p.conversationId } })).toEqual(before);
      expect(await db.directMessage.count({ where: { conversationId: p.conversationId } })).toBe(1);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await attempt; }
  });
  it("denies a target losing verification during an actual account-lock wait", async () => {
    const a = await actor(), b = await actor();
    const lock = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await lock.connect();
    await lock.query("BEGIN"); await lock.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [b.id]);
    const attempt = settled(contactPerson(db, a.token, b.directoryId, input()));
    try {
      await waitForQueue(lock); await lock.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [b.id]);
      await lock.query("COMMIT"); expect((await attempt).status).toBe(404);
      expect(await db.directConversation.count({ where: messagePair(a.id, b.id) })).toBe(0);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await attempt; }
  });
  it("rolls back conversation creation on an actual message-insert failure and safely retries", async () => {
    const a = await actor(), b = await actor(), body = input();
    await migration.query('CREATE FUNCTION messaging_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'synthetic insert failure\'; END $$; CREATE TRIGGER messaging_test_failure BEFORE INSERT ON "DirectMessage" FOR EACH ROW EXECUTE FUNCTION messaging_test_failure()');
    try {
      await expect(contactPerson(db, a.token, b.directoryId, body)).rejects.toThrow();
      expect(await db.directConversation.count({ where: messagePair(a.id, b.id) })).toBe(0);
    } finally { await migration.query('DROP TRIGGER messaging_test_failure ON "DirectMessage"; DROP FUNCTION messaging_test_failure()'); }
    const sent = await contactPerson(db, a.token, b.directoryId, body);
    expect((await readMessages(db, b.token, sent.conversationId)).items).toHaveLength(1);
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-message-send:${a.id}`) } })).hits).toBe(2);
  });
  it("enforces canonical uniqueness, restrictive history FKs, text bounds and narrow runtime grants", async () => {
    const p = await pair(), row = await db.directConversation.findUniqueOrThrow({ where: { id: p.conversationId } });
    await expect(db.directConversation.create({ data: { firstId: row.secondId, secondId: row.firstId, initiatorId: p.a.id, pendingMessages: 1 } })).rejects.toThrow();
    await expect(db.directConversation.create({ data: { firstId: row.firstId, secondId: row.secondId, initiatorId: p.a.id, pendingMessages: 1 } })).rejects.toThrow();
    await expect(db.directMessage.create({ data: { conversationId: p.conversationId, senderId: p.a.id, submissionKey: digest(newToken()), body: " " } })).rejects.toThrow();
    await expect(db.directMessage.create({ data: { conversationId: p.conversationId, senderId: p.a.id, submissionKey: digest(newToken()), body: "a".repeat(4001) } })).rejects.toThrow();
    for (const sql of ['DELETE FROM "DirectMessage"', 'UPDATE "DirectMessage" SET body=\'changed\'', 'DELETE FROM "DirectConversation"', 'UPDATE "DirectConversation" SET "initiatorId"=$1']) await expect(db.$executeRawUnsafe(sql, ...(sql.includes("$1") ? [p.b.id] : []))).rejects.toThrow();
    await expect(migration.query('DELETE FROM "DirectConversation" WHERE id=$1', [p.conversationId])).rejects.toMatchObject({ code: "23001" });
    await expect(migration.query('DELETE FROM "User" WHERE id=$1', [p.a.id])).rejects.toMatchObject({ code: "23001" });
  });
  it("adds messaging to populated pre-messaging history without changing profiles or community attribution", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      const version = "20261107000000_m4_messaging";
      for (const file of readdirSync("prisma/migrations").filter(file => /^\d/.test(file) && file < version).sort()) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), community = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,\'old@university.test\',\'old@university.test\',now())', [user]);
      await client.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") VALUES ($1,\'Preserved اسم\',true,now())', [user]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Existing\',\'History\',\'PRIVATE\')', [community, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [community, user]);
      const snapshot = async () => (await client.query('SELECT (SELECT jsonb_agg(u) FROM "User" u) AS users, (SELECT jsonb_agg(p) FROM "Profile" p) AS profiles, (SELECT jsonb_agg(c) FROM "Community" c) AS communities, (SELECT jsonb_agg(m) FROM "CommunityMembership" m) AS memberships')).rows;
      const before = await snapshot(); await client.query(readFileSync(`prisma/migrations/${version}/migration.sql`, "utf8"));
      expect(await snapshot()).toEqual(before);
      expect((await client.query('SELECT count(*)::integer AS count FROM "DirectMessage"')).rows[0].count).toBe(0);
    } finally { await client.end(); }
  });
});
