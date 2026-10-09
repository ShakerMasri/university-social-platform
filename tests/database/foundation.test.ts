import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { createUser, findUserByEmail, saveProfile } from "../../src/server/database/accounts";
import { createEmailChallenge, consumeEmailChallenge, consumeEmailChallengeInTransaction } from "../../src/server/database/challenges";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { normalizeEmail } from "../../src/server/database/validation";
import { changedCasePairs, contextualCaseSamples } from "../email-case-fixtures";

const manifest = readManifest();
const selected = [process.env.M1B_TEST_DATABASE, process.env.M1B_REPLAY_DATABASE];
const upgradeName = process.env.M1B_UPGRADE_DATABASE;
if (selected.some((name) => !manifest.databases.some((d) => d.name === name && d.kind === "test" && d.ready)) ||
  selected[0] === selected[1]) throw new Error("Two explicitly provisioned disposable test databases are required");
if (!manifest.databases.some((d) => d.name === upgradeName && d.kind === "test" && d.ready) ||
  selected.includes(upgradeName)) throw new Error("A separate owned disposable upgrade database is required");
const urls = selected.map((name) => databaseUrl(manifest, name!, "runtime"));
let db: Awaited<ReturnType<typeof createLocalDatabase>>;
let replay: Awaited<ReturnType<typeof createLocalDatabase>>;
let migration: Client;
let counter = 0;
const nextEmail = () => `Synthetic.${++counter}+M1b@EXAMPLE.TEST`;

beforeAll(async () => {
  db = await createLocalDatabase(urls[0]);
  replay = await createLocalDatabase(urls[1]);
  const url = databaseUrl(manifest, selected[0]!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await migration.connect();
});
afterAll(async () => {
  await Promise.all([db?.$disconnect(), replay?.$disconnect(), migration?.end()]);
});

async function pending() {
  const user = await createUser(db, nextEmail());
  const challenge = await createEmailChallenge(db, user.id, new Date(Date.now() + 60000));
  return { user, challenge, input: { userId: user.id, email: user.email, token: challenge.token } };
}

describe("reviewed migration history on real disposable PostgreSQL", () => {
  it("creates the same tables, keys, foreign keys and custom checks on both empty databases", async () => {
    const catalog = (client: typeof db) => client.$queryRaw<{ table: string; type: string; name: string; definition: string }[]>`
      SELECT c.relname AS table, p.contype::text AS type, p.conname AS name, pg_get_constraintdef(p.oid) AS definition
      FROM pg_constraint p JOIN pg_class c ON c.oid = p.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('User', 'Profile', 'EmailOwnershipChallenge')
      ORDER BY c.relname, p.conname`;
    const first = await catalog(db);
    expect(first).toEqual(await catalog(replay));
    expect(first.filter((c) => c.type === "p")).toHaveLength(3);
    expect(first.filter((c) => c.type === "f")).toHaveLength(2);
    for (const name of ["User_email_policy", "Profile_display_name_policy", "EmailOwnershipChallenge_expiry",
      "EmailOwnershipChallenge_digest", "EmailOwnershipChallenge_state"]) {
      expect(first.some((c) => c.name === name && c.type === "c")).toBe(true);
    }
    expect(first.filter((c) => c.type === "f").every((c) => c.definition.includes("ON DELETE RESTRICT"))).toBe(true);
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    for (const name of ["User_emailKey_key", "User_id_emailKey_key", "EmailOwnershipChallenge_tokenDigest_key",
      "EmailOwnershipChallenge_userId_expiresAt_idx"]) {
      expect(indexes.some((index) => index.indexname === name)).toBe(true);
    }
    expect(first.find((c) => c.name === "User_email_policy")?.definition).toContain("usp_email_lower_v17");
  });

  it("refuses changed historical keys atomically and preserves valid populated data during the forward upgrade", async () => {
    const url = databaseUrl(manifest, upgradeName!, "migration");
    await assertDatabaseIdentity(url, manifest, "migration");
    const upgrade = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await upgrade.connect();
    const ordinaryId = randomUUID();
    const legacyId = randomUUID();
    const challengeId = randomUUID();
    const forward = readFileSync(resolve("prisma/migrations/20261009010000_m1b_email_case_contract/migration.sql"), "utf8");
    try {
      // Apply reviewed SQL directly only on this upgrade fixture, not the two
      // Prisma-history replay databases. Do not fabricate migration records.
      await upgrade.query(readFileSync(resolve("prisma/migrations/20261009000000_m1b_foundation/migration.sql"), "utf8"));
      await upgrade.query('INSERT INTO "User" (id, email, "emailKey", "updatedAt") VALUES ($1, $2, $3, now()), ($4, $5, $5, now())',
        [ordinaryId, "Ordinary+Upgrade@EXAMPLE.TEST", "ordinary+upgrade@example.test", legacyId, "\uA7CE.legacy@example.test"]);
      await upgrade.query('INSERT INTO "Profile" ("userId", "displayName", "updatedAt") VALUES ($1, $2, now())', [ordinaryId, "Alice أحمد"]);
      await upgrade.query('INSERT INTO "EmailOwnershipChallenge" (id, "userId", "emailKey", "tokenDigest", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval \'1 minute\')',
        [challengeId, ordinaryId, "ordinary+upgrade@example.test", "a".repeat(64)]);
      const snapshot = () => upgrade.query('SELECT (SELECT json_agg(u ORDER BY id) FROM "User" u) AS users, (SELECT json_agg(p) FROM "Profile" p) AS profiles, (SELECT json_agg(c) FROM "EmailOwnershipChallenge" c) AS challenges');
      const rejectedBefore = (await snapshot()).rows;
      await expect(upgrade.query(forward)).rejects.toMatchObject({ code: "P0001" });
      await upgrade.query("ROLLBACK");
      expect((await snapshot()).rows).toEqual(rejectedBefore);
      expect((await upgrade.query("SELECT to_regprocedure('public.usp_email_lower_v17(text)')::text AS name")).rows[0].name).toBeNull();
      // Remove only the deliberately incompatible synthetic fixture. Real data
      // would require a separate owner-reviewed collision/FK migration.
      await upgrade.query('DELETE FROM "User" WHERE id = $1', [legacyId]);
      const before = (await snapshot()).rows;
      await upgrade.query(forward);
      expect((await snapshot()).rows).toEqual(before);
      expect((await upgrade.query('SELECT public.usp_email_lower_v17($1) AS key', ["\uA7CE.synthetic@example.test"])).rows[0].key)
        .toBe("\uA7CF.synthetic@example.test");
    } finally { await upgrade.end(); }
  });

  it("persists optional profiles, Unicode names and email spelling across reconnects", async () => {
    const user = await createUser(db, ` \t${nextEmail()}\n`);
    expect(user.emailVerifiedAt).toBeNull();
    expect(await db.profile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(Object.hasOwn(user, "teacher")).toBe(false);
    for (const name of ["أحمد", "Alice", "أحمد Ali", "😀".repeat(60)]) await saveProfile(db, user.id, name);
    await db.$disconnect();
    db = await createLocalDatabase(urls[0]);
    const loaded = await findUserByEmail(db, user.email.toUpperCase());
    expect(loaded?.id).toBe(user.id);
    expect(loaded?.email).toBe(user.email);
    expect(loaded?.emailKey).toBe(user.email.toLowerCase());
    expect((await db.profile.findUniqueOrThrow({ where: { userId: user.id } })).displayName).toBe("😀".repeat(60));
  });

  it("treats whole-address capitalization as one account and preserves dots/plus suffixes", async () => {
    const email = nextEmail();
    const user = await createUser(db, email);
    await expect(createUser(db, email.toLowerCase())).rejects.toThrow();
    expect((await findUserByEmail(db, ` ${email.toUpperCase()} `))?.id).toBe(user.id);
    const distinct = await createUser(db, email.replace(".", "").replace("+M1b", ""));
    expect(distinct.id).not.toBe(user.id);
    const unicode = await createUser(db, "İΣ+ع@EXAMPLE.TEST");
    expect(unicode.emailKey).toBe("İΣ+ع@EXAMPLE.TEST".toLowerCase());
  });

  it("enforces 254 code points in PostgreSQL even when server validation is bypassed", async () => {
    const email = `${"ع".repeat(247)}@x.test`;
    await expect(createUser(db, email)).resolves.toHaveProperty("email", email);
    await expect(db.user.create({ data: { email: `${email}x`, emailKey: `${email}x` } })).rejects.toThrow();
    await expect(db.user.create({ data: { email: "MISMATCH@x.test", emailKey: "other@x.test" } })).rejects.toThrow();
    await expect(db.user.create({ data: { email: " x@x.test", emailKey: " x@x.test" } })).rejects.toThrow();
    const expanding = `${"İ".repeat(247)}@x.test`;
    expect(() => createUser(db, expanding)).toThrow("Invalid email");
    await expect(db.user.create({ data: { email: expanding, emailKey: expanding } })).rejects.toThrow();
    const boundary = `${"İ".repeat(123)}a@x.test`;
    expect([...(await createUser(db, boundary)).emailKey]).toHaveLength(254);
  });

  it("uses the same fixed Unicode contract for all 28 mismatches, lookup, duplicates and challenges", async () => {
    for (const [upper, lower] of changedCasePairs) {
      const email = `${upper}.synthetic+Case@EXAMPLE.TEST`;
      const key = `${lower}.synthetic+case@example.test`;
      const user = await createUser(db, ` ${email} `);
      expect(user.email).toBe(email);
      expect(user.emailKey).toBe(key);
      expect((await findUserByEmail(db, key))?.id).toBe(user.id);
      await expect(createUser(db, key)).rejects.toThrow();
      const challenge = await createEmailChallenge(db, user.id, new Date(Date.now() + 60000));
      const input = { userId: user.id, email: key, token: challenge.token };
      expect(await consumeEmailChallenge(db, input)).toBe(true);
      expect(await consumeEmailChallenge(db, input)).toBe(false);
    }
    // A bypass retaining the old uppercase key still fails the database safeguard.
    await expect(db.user.create({ data: { email: "\uA7CE.bypass@example.test", emailKey: "\uA7CE.bypass@example.test" } })).rejects.toThrow();
  });

  it("matches the pinned runtime for all mapped scalars and contextual Turkish/Greek/Arabic samples", async () => {
    expect(process.versions.unicode).toBe("17.0");
    const inputs = [...contextualCaseSamples];
    for (let code = 1; code <= 0x10ffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const ch = String.fromCodePoint(code);
      if (ch !== ch.toLowerCase()) inputs.push(`${ch}.scalar@EXAMPLE.TEST`);
    }
    const { rows } = await migration.query<{ input: string; key: string }>(
      'SELECT input, public.usp_email_lower_v17(input) AS key FROM unnest($1::text[]) AS input', [inputs]);
    expect(rows).toHaveLength(inputs.length);
    for (const row of rows) {
      expect(row.key).toBe(row.input.toLowerCase());
      expect(row.key).toBe(normalizeEmail(row.input).emailKey);
    }
  });

  it("enforces nonblank, 60-code-point names, one profile and profile foreign keys", async () => {
    const user = await createUser(db, nextEmail());
    for (const displayName of ["", " \t\n", "\u00a0\u2003\ufeff", "ع".repeat(61), "😀".repeat(61)]) {
      await expect(db.profile.create({ data: { userId: user.id, displayName } })).rejects.toThrow();
    }
    await db.profile.create({ data: { userId: user.id, displayName: "Alice أحمد" } });
    await expect(db.profile.create({ data: { userId: user.id, displayName: "Another" } })).rejects.toThrow();
    await expect(db.profile.create({ data: { userId: randomUUID(), displayName: "Orphan" } })).rejects.toThrow();
    await expect(migration.query('DELETE FROM "User" WHERE id = $1', [user.id])).rejects.toMatchObject({ code: "23001" });
  });

  it("enforces challenge digest uniqueness/format, target foreign keys, expiry and restrictive deletion", async () => {
    const { user, challenge } = await pending();
    const stored = await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    const data = { userId: user.id, emailKey: user.emailKey, tokenDigest: stored.tokenDigest,
      createdAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60000) };
    await expect(db.emailOwnershipChallenge.create({ data })).rejects.toThrow();
    await expect(db.emailOwnershipChallenge.create({ data: { ...data, tokenDigest: "invalid" } })).rejects.toThrow();
    await expect(db.emailOwnershipChallenge.create({ data: { ...data, tokenDigest: randomBytes(32).toString("hex"),
      userId: randomUUID() } })).rejects.toThrow();
    await expect(db.emailOwnershipChallenge.create({ data: { ...data, tokenDigest: randomBytes(32).toString("hex"),
      emailKey: "other@example.test" } })).rejects.toThrow();
    await expect(db.emailOwnershipChallenge.create({ data: { ...data, tokenDigest: randomBytes(32).toString("hex"),
      expiresAt: data.createdAt } })).rejects.toThrow();
    await expect(migration.query('DELETE FROM "User" WHERE id = $1', [user.id])).rejects.toMatchObject({ code: "23001" });
    expect(Object.hasOwn(stored, "token")).toBe(false);
    expect(stored.tokenDigest === challenge.token).toBe(false);
    expect(stored.tokenDigest.length).toBe(64);
  });

  it("limits the runtime role and protects the project marker", async () => {
    const client = new Client({ connectionString: urls[0], connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      for (const sql of ['CREATE TABLE public.forbidden (id integer)', 'CREATE SCHEMA forbidden',
        "CREATE DATABASE forbidden", "CREATE ROLE forbidden", "UPDATE __m1b.guard SET owner = 'other'",
        'UPDATE "User" SET email = \'other@example.test\'', 'DELETE FROM "User"']) {
        await expect(client.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
    } finally { await client.end(); }
    await expect(migration.query("UPDATE __m1b.guard SET owner = 'other'")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("synthetic single-use challenge transitions", () => {
  it("rejects malformed/unknown tokens, wrong email and another user's token", async () => {
    const { user, challenge, input } = await pending();
    const other = await createUser(db, nextEmail());
    for (const attempt of [{ ...input, token: "bad" }, { ...input, token: "x".repeat(43) },
      { ...input, email: "wrong@example.test" }, { ...input, userId: other.id },
      { ...input, userId: randomUUID() }]) {
      expect(await consumeEmailChallenge(db, attempt)).toBe(false);
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    expect((await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).consumedAt).toBeNull();
  });

  it("rejects expired and revoked challenges", async () => {
    const expired = await pending();
    // A separate valid historical interval avoids bypassing the expiry database check.
    await migration.query('UPDATE "EmailOwnershipChallenge" SET "createdAt" = $1, "expiresAt" = $2 WHERE id = $3',
      [new Date(Date.now() - 60000), new Date(Date.now() - 1000), expired.challenge.id]);
    expect(await consumeEmailChallenge(db, expired.input)).toBe(false);
    const revoked = await pending();
    await db.emailOwnershipChallenge.update({ where: { id: revoked.challenge.id }, data: { revokedAt: new Date() } });
    expect(await consumeEmailChallenge(db, revoked.input)).toBe(false);
    for (const fixture of [expired, revoked]) {
      expect((await db.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).emailVerifiedAt).toBeNull();
    }
  });

  it("atomically verifies with whole-address matching and rejects replay", async () => {
    const { user, challenge, input } = await pending();
    expect(await consumeEmailChallenge(db, { ...input, email: ` ${user.email.toUpperCase()} ` })).toBe(true);
    const loaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    const consumed = await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(loaded.emailVerifiedAt?.getTime()).toBe(consumed.consumedAt?.getTime());
    expect(loaded.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await consumeEmailChallenge(db, input)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toEqual(loaded.emailVerifiedAt);
  });

  it("rejects a challenge that expires while its consumer waits for a row lock", async () => {
    const { user, challenge, input } = await pending();
    const expiresAt = new Date(Date.now() + 2000);
    await migration.query('UPDATE "EmailOwnershipChallenge" SET "expiresAt" = $1 WHERE id = $2', [expiresAt, challenge.id]);
    const locker = new Client({ connectionString: urls[0], connectionTimeoutMillis: 5000 });
    await locker.connect();
    let attempt: ReturnType<typeof consumeEmailChallenge> | undefined;
    try {
      await locker.query("BEGIN");
      await locker.query('SELECT id FROM "EmailOwnershipChallenge" WHERE id = $1 FOR UPDATE', [challenge.id]);
      attempt = consumeEmailChallenge(db, input);
      let waiting = false;
      const waitDeadline = Date.now() + 1500;
      while (!waiting && Date.now() < waitDeadline) {
        // Activity statistics can be cached for this lock-holding transaction.
        // Refresh the snapshot before observing the other connection's wait.
        await locker.query("SELECT pg_stat_clear_snapshot()");
        const result = await locker.query<{ waiting: boolean }>(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE usename = current_user AND datname = current_database()
          AND pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
        ) AS waiting`);
        waiting = result.rows[0].waiting;
        if (!waiting) await new Promise((done) => setTimeout(done, 20));
      }
      expect(waiting).toBe(true); // Prove the consumer actually waited for a lock before expiry.
      await new Promise((done) => setTimeout(done, Math.max(0, expiresAt.getTime() - Date.now()) + 100));
      await locker.query("COMMIT");
      expect(await attempt).toBe(false);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    } finally {
      await locker.query("ROLLBACK");
      await locker.end();
      await attempt;
    }
  });

  it("rolls back both writes after a forced later transaction failure", async () => {
    const { user, challenge, input } = await pending();
    await expect(db.$transaction(async (tx) => {
      if (!await consumeEmailChallengeInTransaction(tx, input)) throw new Error("Transition unexpectedly rejected");
      throw new Error("Synthetic rollback");
    })).rejects.toThrow("Synthetic rollback");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    expect((await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).consumedAt).toBeNull();
    expect(await consumeEmailChallenge(db, input)).toBe(true);
  });

  it("allows exactly one success under concurrent consumption from separate transactions", async () => {
    const { user, challenge, input } = await pending();
    const secondClient = await createLocalDatabase(urls[0]);
    try {
      const results = await Promise.all([consumeEmailChallenge(db, input), consumeEmailChallenge(secondClient, input)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await db.emailOwnershipChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).consumedAt).toBeInstanceOf(Date);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
    } finally { await secondClient.$disconnect(); }
  });
});
