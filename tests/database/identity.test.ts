import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { normalizeEmail } from "../../src/server/database/validation";
import { allowIP, confirmInTransaction, confirmSignIn, logout, ownProfile, requestSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { digest, keyedDigest, newToken, sessionLifetime } from "../../src/server/identity/policy";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";

const manifest = readManifest();
const name = process.env.M1B_TEST_DATABASE;
const upgradeName = process.env.M2_UPGRADE_DATABASE;
for (const selected of [name, upgradeName]) {
  if (!manifest.databases.some((d) => d.name === selected && d.kind === "test" && d.ready)) throw new Error("Owned identity test databases required");
}
let db: Awaited<ReturnType<typeof createLocalDatabase>>;
let migration: Client;
const options = { rateKey: randomBytes(32).toString("hex"), domains: ["university.test"] };
let index = 0;
const ip = () => `198.51.100.${++index}`;
const email = () => `Synthetic.${randomUUID()}+M2@UNIVERSITY.TEST`;

beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });

async function issue(address = email(), browser = newToken(), source = ip()) {
  let token = "";
  await requestSignIn(db, options, { email: address, browser, ip: source }, async (message) => { token = message.token; });
  if (!token) throw new Error("Synthetic issuance failed");
  return { token, browser, ip: source, email: address };
}
async function ageChallenges(address: string, milliseconds: number) {
  await migration.query('UPDATE "EmailOwnershipChallenge" SET "createdAt" = "createdAt" - $1 * interval \'1 millisecond\', "expiresAt" = "expiresAt" - $1 * interval \'1 millisecond\', "consumedAt" = "consumedAt" - $1 * interval \'1 millisecond\', "revokedAt" = "revokedAt" - $1 * interval \'1 millisecond\' WHERE "emailKey" = $2', [milliseconds, normalizeEmail(address).emailKey]);
}

describe("M2 on real disposable PostgreSQL", () => {
  it("preserves populated M1b identity data in the additive migration and checks the new constraints/grants", async () => {
    const url = databaseUrl(manifest, upgradeName!, "migration");
    await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of ["20261009000000_m1b_foundation", "20261009010000_m1b_email_case_contract"]) {
        await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      }
      const id = randomUUID(), challengeId = randomUUID();
      await client.query('INSERT INTO "User" (id, email, "emailKey", "updatedAt") VALUES ($1, $2, $2, now())', [id, "prior@university.test"]);
      await client.query('INSERT INTO "Profile" ("userId", "displayName", "updatedAt") VALUES ($1, $2, now())', [id, "أحمد Alice"]);
      await client.query('INSERT INTO "EmailOwnershipChallenge" (id, "userId", "emailKey", "tokenDigest", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval \'1 hour\')', [challengeId, id, "prior@university.test", digest(newToken())]);
      const snapshot = async () => (await client.query('SELECT (SELECT json_agg(u) FROM "User" u) AS users, (SELECT json_agg(p) FROM "Profile" p) AS profiles')).rows;
      const before = await snapshot();
      await client.query(readFileSync("prisma/migrations/20261010000000_m2_identity/migration.sql", "utf8"));
      expect(await snapshot()).toEqual(before);
      expect((await client.query('SELECT "browserDigest" FROM "EmailOwnershipChallenge" WHERE id = $1', [challengeId])).rows[0].browserDigest).toBeNull();
    } finally { await client.end(); }
    const constraints = await db.$queryRaw<{ name: string }[]>`SELECT conname AS name FROM pg_constraint WHERE conname IN ('Session_policy', 'Session_userId_fkey', 'IdentityRateLimit_policy', 'EmailOwnershipChallenge_browser_digest')`;
    expect(constraints).toHaveLength(4);
    const user = await db.user.create({ data: normalizeEmail(email()) });
    await expect(db.session.create({ data: { userId: user.id, tokenDigest: "bad", expiresAt: new Date(Date.now() + 10000) } })).rejects.toThrow();
    await expect(db.session.create({ data: { userId: randomUUID(), tokenDigest: digest(newToken()), expiresAt: new Date(Date.now() + 10000) } })).rejects.toThrow();
    await expect(db.identityRateLimit.create({ data: { keyDigest: digest(newToken()), hits: 31 } })).rejects.toThrow();
    for (const sql of ['UPDATE "User" SET email = \'changed@university.test\'', 'DELETE FROM "User"', 'UPDATE "Session" SET "userId" = $1', 'DELETE FROM "Session"']) {
      await expect(db.$executeRawUnsafe(sql, ...(sql.includes("$1") ? [user.id] : []))).rejects.toThrow();
    }
  });

  it("atomically verifies once, creates one digest-only session, saves a Unicode profile and logs in again without changing attribution", async () => {
    const fixture = await issue();
    const challenge = await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { tokenDigest: digest(fixture.token) } });
    expect(challenge.browserDigest).toBe(digest(fixture.browser));
    expect(challenge.expiresAt.getTime() - challenge.createdAt.getTime()).toBe(600000);
    expect(await ownProfile(db, fixture.browser)).toBeNull();
    const sessions = await Promise.all([confirmSignIn(db, options, fixture), confirmSignIn(db, options, fixture)]);
    expect(sessions.filter(Boolean)).toHaveLength(1);
    const session = sessions.find(Boolean)!;
    const stored = await db.session.findUniqueOrThrow({ where: { tokenDigest: digest(session.token) } });
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(sessionLifetime);
    expect(JSON.stringify(await db.emailOwnershipChallenge.findMany({ where: { userId: stored.userId } })).includes(fixture.token)).toBe(false);
    expect(JSON.stringify(stored).includes(session.token)).toBe(false);
    expect(await updateOwnProfile(db, session.token, "أحمد Ali 😀")).toBe(true);
    expect(await ownProfile(db, session.token)).toEqual({ email: fixture.email, displayName: "أحمد Ali 😀" });
    expect(() => updateOwnProfile(db, session.token, " ")).toThrow();
    const verifiedAt = (await db.user.findUniqueOrThrow({ where: { id: stored.userId } })).emailVerifiedAt;
    await ageChallenges(fixture.email, 61000);
    const returning = await issue(fixture.email.toLowerCase(), fixture.browser, ip());
    const next = await confirmSignIn(db, options, { ...returning, previousSession: session.token });
    expect(next).not.toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: stored.userId } })).emailVerifiedAt).toEqual(verifiedAt);
    expect(await ownProfile(db, session.token)).toBeNull();
    expect((await ownProfile(db, next!.token))?.displayName).toBe("أحمد Ali 😀");
  });

  it("rejects wrong-browser, unknown, expired, revoked, reused and legacy unbound tokens", async () => {
    const fixture = await issue();
    expect(await confirmSignIn(db, options, { ...fixture, browser: newToken() })).toBeNull();
    expect(await confirmSignIn(db, options, { ...fixture, token: newToken() })).toBeNull();
    await ageChallenges(fixture.email, 601000);
    expect(await confirmSignIn(db, options, fixture)).toBeNull();
    const revoked = await issue();
    await db.emailOwnershipChallenge.update({ where: { tokenDigest: digest(revoked.token) }, data: { revokedAt: new Date() } });
    expect(await confirmSignIn(db, options, revoked)).toBeNull();
    const legacy = await issue();
    await migration.query('UPDATE "EmailOwnershipChallenge" SET "browserDigest" = NULL WHERE "tokenDigest" = $1', [digest(legacy.token)]);
    expect(await confirmSignIn(db, options, legacy)).toBeNull();
    expect(await db.session.count({ where: { user: { emailKey: normalizeEmail(fixture.email).emailKey } } })).toBe(0);
  });

  it("rolls back consumption and verification if session creation fails", async () => {
    const fixture = await issue();
    await expect(db.$transaction(async (tx) => {
      const result = await confirmInTransaction(tx, fixture);
      if (!result) throw new Error("Unexpected rejection");
      await tx.session.create({ data: { userId: randomUUID(), tokenDigest: digest(newToken()), expiresAt: result.expiresAt } });
    })).rejects.toThrow();
    const challenge = await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { tokenDigest: digest(fixture.token) }, include: { user: true } });
    expect(challenge.consumedAt).toBeNull(); expect(challenge.user.emailVerifiedAt).toBeNull();
    expect(await db.session.count({ where: { userId: challenge.userId } })).toBe(0);
    expect(await confirmSignIn(db, options, fixture)).not.toBeNull();
  });

  it("enforces rolling email cooldown/hour/day limits and replaces links under concurrent resends", async () => {
    const fixture = await issue();
    let sent = 0;
    const send = async () => { sent++; };
    await requestSignIn(db, options, { email: fixture.email, browser: fixture.browser, ip: ip() }, send);
    expect(sent).toBe(0);
    await ageChallenges(fixture.email, 61000);
    let replacement = "";
    await Promise.all([0, 1].map(() => requestSignIn(db, options, { email: fixture.email.toLowerCase(), browser: fixture.browser, ip: ip() }, async (message) => { replacement = message.token; sent++; })));
    expect(sent).toBe(1);
    expect(await confirmSignIn(db, options, fixture)).toBeNull();
    expect(await db.user.count({ where: { emailKey: normalizeEmail(fixture.email).emailKey } })).toBe(1);
    expect(replacement).not.toBe("");
    for (let i = 0; i < 3; i++) { await ageChallenges(fixture.email, 61000); await requestSignIn(db, options, { email: fixture.email, browser: fixture.browser, ip: ip() }, send); }
    expect(sent).toBe(4);
    await ageChallenges(fixture.email, 61000);
    await requestSignIn(db, options, { email: fixture.email, browser: fixture.browser, ip: ip() }, send);
    expect(sent).toBe(4); // Total 5/hour including the first issuance.
    await ageChallenges(fixture.email, 3600001);
    for (let i = 0; i < 5; i++) { await requestSignIn(db, options, { email: fixture.email, browser: fixture.browser, ip: ip() }, send); await ageChallenges(fixture.email, 61000); }
    expect(sent).toBe(9);
    await ageChallenges(fixture.email, 3600001);
    await requestSignIn(db, options, { email: fixture.email, browser: fixture.browser, ip: ip() }, send);
    expect(sent).toBe(9); // Total 10/day; elapsed < 24 hours.
  });

  it("persists atomic per-IP limits, separates request/confirmation and resets only after the IP window", async () => {
    const source = ip();
    const attempts = await Promise.all(Array.from({ length: 35 }, () => allowIP(db, options, source, "request")));
    expect(attempts.filter(Boolean)).toHaveLength(30);
    expect(await allowIP(db, { ...options }, source, "request")).toBe(false);
    expect(await allowIP(db, options, source, "confirm")).toBe(true);
    const key = keyedDigest(options.rateKey, `ip:request:${source}`);
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt" = now() - interval \'16 minutes\' WHERE "keyDigest" = $1', [key]);
    expect(await allowIP(db, options, source, "request")).toBe(true);
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(1);
  });

  it("revokes failed delivery and never creates a session from it", async () => {
    const address = email();
    await requestSignIn(db, options, { email: address, browser: newToken(), ip: ip() }, async () => { throw new Error("Synthetic failure"); });
    const challenge = await db.emailOwnershipChallenge.findFirstOrThrow({ where: { emailKey: normalizeEmail(address).emailKey } });
    expect(challenge.revokedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: challenge.userId } })).toBe(0);
  });

  it("denies unverified users, expired sessions, logout replay and cross-user credential guessing", async () => {
    const first = await issue(), second = await issue();
    const one = (await confirmSignIn(db, options, first))!, two = (await confirmSignIn(db, options, second))!;
    await updateOwnProfile(db, one.token, "Alice"); await updateOwnProfile(db, two.token, "علي");
    expect((await ownProfile(db, one.token))?.displayName).toBe("Alice");
    expect((await ownProfile(db, two.token))?.displayName).toBe("علي");
    const secondUser = await db.user.findUniqueOrThrow({ where: { emailKey: normalizeEmail(second.email).emailKey } });
    expect(await ownProfile(db, secondUser.id)).toBeNull();
    expect(await updateOwnProfile(db, newToken(), "Cross user")).toBe(false);
    await migration.query('UPDATE "User" SET "emailVerifiedAt" = NULL WHERE id = $1', [secondUser.id]);
    expect(await ownProfile(db, two.token)).toBeNull();
    expect(await logout(db, one.token)).toBe(true);
    expect(await ownProfile(db, one.token)).toBeNull(); expect(await logout(db, one.token)).toBe(false);
    const expired = (await confirmSignIn(db, options, await issue()))!;
    await migration.query('UPDATE "Session" SET "createdAt" = now() - interval \'8 days\', "expiresAt" = now() - interval \'1 day\' WHERE "tokenDigest" = $1', [digest(expired.token)]);
    expect(await ownProfile(db, expired.token)).toBeNull(); expect(await updateOwnProfile(db, expired.token, "Denied")).toBe(false);
  });

  it("allows revocation to complete while a first profile save waits for its account, then denies the save", async () => {
    const fixture = await issue();
    const session = (await confirmSignIn(db, options, fixture))!;
    const user = await db.user.findUniqueOrThrow({ where: { emailKey: normalizeEmail(fixture.email).emailKey } });
    const locker = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await locker.connect();
    let save: ReturnType<typeof updateOwnProfile> | undefined;
    try {
      await locker.query("BEGIN");
      await locker.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [user.id]);
      save = updateOwnProfile(db, session.token, "Must not persist");
      let blocked = false;
      for (let i = 0; i < 40; i++) {
        await migration.query("SELECT pg_stat_clear_snapshot()");
        const result = await migration.query("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() AND NOT l.granted) AS blocked");
        if (result.rows[0].blocked) { blocked = true; break; }
        await new Promise((done) => setTimeout(done, 25));
      }
      expect(blocked).toBe(true);
      // Reproduces reauthentication's account -> old session lock order. A
      // session-first save would hold this row and cause timeout/deadlock.
      await locker.query("SET LOCAL lock_timeout = '500ms'");
      await locker.query('UPDATE "Session" SET "revokedAt" = clock_timestamp() WHERE "tokenDigest" = $1', [digest(session.token)]);
      await locker.query("COMMIT");
      expect(await save).toBe(false);
      expect(await db.profile.findUnique({ where: { userId: user.id } })).toBeNull();
    } finally { await locker.query("ROLLBACK"); await locker.end(); await save; }
  });

  it("rechecks challenge expiry after actually waiting for a user lock", async () => {
    const fixture = await issue();
    const challenge = await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { tokenDigest: digest(fixture.token) } });
    await migration.query('UPDATE "EmailOwnershipChallenge" SET "expiresAt" = clock_timestamp() + interval \'2 seconds\' WHERE id = $1', [challenge.id]);
    const locker = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await locker.connect();
    let attempt: ReturnType<typeof confirmSignIn> | undefined;
    try {
      await locker.query("BEGIN"); await locker.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [challenge.userId]);
      attempt = confirmSignIn(db, options, fixture);
      let blocked = false;
      for (let i = 0; i < 40; i++) {
        await migration.query("SELECT pg_stat_clear_snapshot()");
        const result = await migration.query("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() AND NOT l.granted) AS blocked");
        if (result.rows[0].blocked) { blocked = true; break; }
        await new Promise((done) => setTimeout(done, 25));
      }
      expect(blocked).toBe(true);
      await new Promise((done) => setTimeout(done, 2100));
      await locker.query("COMMIT");
      expect(await attempt).toBeNull();
    } finally { await locker.query("ROLLBACK"); await locker.end(); await attempt; }
  });
});
