import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { normalizeEmail } from "../../src/server/database/validation";
import { confirmSignIn, logout, requestSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { digest, newToken } from "../../src/server/identity/policy";
import { changeMembership, createCommunity, discoverCommunities, listMemberships, readCommunity } from "../../src/server/communities/service";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgradeName = process.env.M3_UPGRADE_DATABASE;
for (const selected of [name, upgradeName]) if (!manifest.databases.some((d) => d.name === selected && d.kind === "test" && d.ready)) throw new Error("Owned community test targets required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const options = { rateKey: randomBytes(32).toString("hex"), domains: ["university.test"] };
let sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function user(profile = true) {
  const email = `m3.${randomUUID()}@university.test`, browser = newToken(), ip = `198.51.100.${++sequence}`;
  let token = "";
  await requestSignIn(db, options, { email, browser, ip }, async (message) => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic community identity failed");
  if (profile) await updateOwnProfile(db, session.token, "عضو Synthetic 😀");
  const record = await db.user.findUniqueOrThrow({ where: { emailKey: normalizeEmail(email).emailKey } });
  return { token: session.token, id: record.id };
}
const input = (visibility: "PUBLIC" | "PRIVATE" = "PRIVATE") => ({ name: "هندسة Computer 😀", description: "English / عربي\nSynthetic description", visibility });
const denied = (result: Promise<unknown>, status: number) => expect(result).rejects.toMatchObject({ status });
async function waiting(expected = 1) {
  for (let i = 0; i < 150; i++) {
    await migration.query("SELECT pg_stat_clear_snapshot()");
    const result = await migration.query<{ count: string }>("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() AND NOT l.granted AND l.locktype = 'advisory'");
    if (Number(result.rows[0].count) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Expected a real community lock wait");
}
async function seedMembershipBudget(userId: string, count: number, owned = 0) {
  // Bulk synthetic boundary fixtures; other creators remain within their own 50 cap.
  const creatorIds = Array.from({ length: Math.ceil((count - owned) / 50) }, () => randomUUID());
  const ids = Array.from({ length: count }, () => randomUUID());
  const ownerIds = ids.map((_, index) => index < owned ? userId : creatorIds[Math.floor((index - owned) / 50)]);
  await migration.query("BEGIN");
  try {
    await migration.query('INSERT INTO "User" (id, email, "emailKey", "updatedAt", "emailVerifiedAt") SELECT id, \'cap.\' || id::text || \'@university.test\', \'cap.\' || id::text || \'@university.test\', now(), now() FROM unnest($1::uuid[]) AS id', [creatorIds]);
    await migration.query('INSERT INTO "Profile" ("userId", "displayName", "updatedAt") SELECT id, \'Synthetic cap creator\', now() FROM unnest($1::uuid[]) AS id', [creatorIds]);
    await migration.query('INSERT INTO "Community" (id, "ownerId", name, description, visibility) SELECT id, owner, \'Membership cap fixture\', \'\', \'PRIVATE\' FROM unnest($1::uuid[], $2::uuid[]) AS pair(id, owner)', [ids, ownerIds]);
    await migration.query('INSERT INTO "CommunityMembership" ("communityId", "userId", status) SELECT id, owner, \'MEMBER\' FROM unnest($1::uuid[], $2::uuid[]) AS pair(id, owner)', [ids, ownerIds]);
    await migration.query('INSERT INTO "CommunityMembership" ("communityId", "userId", status) SELECT id, $2::uuid, CASE WHEN ordinal % 2 = 0 THEN \'PENDING\' ELSE \'MEMBER\' END::"MembershipStatus" FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)', [ids.slice(owned), userId]);
    await migration.query("COMMIT");
  } catch (error) { await migration.query("ROLLBACK"); throw error; }
}
const totals = () => Promise.all([db.community.count(), db.communityMembership.count()]);
describe("M3 real PostgreSQL persistence and authorization", () => {
  it("adds community tables without changing populated M2 identity, profile, challenge or session data", async () => {
    const url = databaseUrl(manifest, upgradeName!, "migration");
    await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of ["20261009000000_m1b_foundation", "20261009010000_m1b_email_case_contract", "20261010000000_m2_identity"]) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const id = randomUUID();
      await client.query('INSERT INTO "User" (id, email, "emailKey", "updatedAt", "emailVerifiedAt") VALUES ($1, $2, $2, now(), now())', [id, "m3-prior@university.test"]);
      await client.query('INSERT INTO "Profile" ("userId", "displayName", "updatedAt") VALUES ($1, $2, now())', [id, "أحمد Alice"]);
      await client.query('INSERT INTO "EmailOwnershipChallenge" (id, "userId", "emailKey", "tokenDigest", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval \'1 hour\')', [randomUUID(), id, "m3-prior@university.test", digest(newToken())]);
      await client.query('INSERT INTO "Session" (id, "userId", "tokenDigest", "expiresAt") VALUES ($1, $2, $3, now() + interval \'1 day\')', [randomUUID(), id, digest(newToken())]);
      const snapshot = async () => (await client.query('SELECT (SELECT json_agg(u) FROM "User" u) AS users, (SELECT json_agg(p) FROM "Profile" p) AS profiles, (SELECT json_agg(c) FROM "EmailOwnershipChallenge" c) AS challenges, (SELECT json_agg(s) FROM "Session" s) AS sessions')).rows;
      const before = await snapshot();
      await client.query(readFileSync("prisma/migrations/20261010010000_m3_communities/migration.sql", "utf8"));
      expect(await snapshot()).toEqual(before);
    } finally { await client.end(); }
  });
  it("atomically creates owner membership, preserves Unicode, enforces constraints and narrow runtime grants", async () => {
    const owner = await user(), { id } = await createCommunity(db, owner.token, input("PUBLIC"));
    expect(await readCommunity(db, owner.token, id)).toMatchObject({ name: input().name, isOwner: true, membership: "MEMBER" });
    expect(await db.communityMembership.count({ where: { communityId: id, userId: owner.id } })).toBe(1);
    await expect(db.communityMembership.create({ data: { communityId: id, userId: owner.id, status: "MEMBER" } })).rejects.toThrow();
    await expect(db.communityMembership.create({ data: { communityId: id, userId: randomUUID(), status: "MEMBER" } })).rejects.toThrow();
    await expect(db.community.create({ data: { ...input(), name: " ", ownerId: owner.id } })).rejects.toThrow();
    await expect(db.community.create({ data: { ...input(), ownerId: randomUUID() } })).rejects.toThrow();
    for (const sql of ['UPDATE "Community" SET "ownerId" = $1', 'DELETE FROM "Community" WHERE id = $1', 'UPDATE "CommunityMembership" SET "userId" = $1']) await expect(db.$executeRawUnsafe(sql, owner.id)).rejects.toThrow();
    // Fault after the parent insert must roll back both the community and owner membership.
    await migration.query('CREATE FUNCTION public.usp_m3_fail_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'synthetic failure\'; END $$');
    await migration.query('CREATE TRIGGER usp_m3_fail_member BEFORE INSERT ON "CommunityMembership" FOR EACH ROW EXECUTE FUNCTION public.usp_m3_fail_member()');
    const before = await db.community.count({ where: { ownerId: owner.id } });
    try { await expect(createCommunity(db, owner.token, input())).rejects.toThrow(); }
    finally { await migration.query('DROP TRIGGER usp_m3_fail_member ON "CommunityMembership"'); await migration.query('DROP FUNCTION public.usp_m3_fail_member()'); }
    expect(await db.community.count({ where: { ownerId: owner.id } })).toBe(before);
  });
  it("allows approved discovery metadata but denies private space and owner operations to non-members and members", async () => {
    const owner = await user(), member = await user(), outsider = await user();
    const { id } = await createCommunity(db, owner.token, input());
    const card = (await discoverCommunities(db, outsider.token)).items.find((item) => item.id === id);
    expect(card).toMatchObject({ id, name: input().name, description: input().description, isOwner: false, membership: null });
    expect(card).not.toHaveProperty("ownerId"); expect(card).not.toHaveProperty("memberships");
    await denied(readCommunity(db, outsider.token, id), 404);
    for (const person of [outsider, member]) {
      await denied(listMemberships(db, person.token, id), 403);
      await denied(changeMembership(db, person.token, id, { action: "approve", userId: member.id }), 403);
      await denied(changeMembership(db, person.token, id, { action: "remove", userId: owner.id }), 403);
    }
    await changeMembership(db, member.token, id, { action: "join" });
    await denied(readCommunity(db, member.token, id), 404);
    await changeMembership(db, owner.token, id, { action: "approve", userId: member.id });
    expect(await readCommunity(db, member.token, id)).toMatchObject({ membership: "MEMBER", isOwner: false });
    await denied(listMemberships(db, member.token, id), 403);
    for (const action of ["approve", "remove"]) await denied(changeMembership(db, member.token, id, { action, userId: outsider.id }), 403);
    const list = await listMemberships(db, owner.token, id);
    expect(list.items).toHaveLength(2); expect(JSON.stringify(list)).not.toContain("email");
    await denied(changeMembership(db, owner.token, id, { action: "approve", userId: outsider.id }), 404);
    await denied(changeMembership(db, owner.token, id, { action: "leave" }), 409);
    await denied(changeMembership(db, owner.token, id, { action: "remove", userId: owner.id }), 409);
    expect(() => changeMembership(db, member.token, id, { action: "leave", userId: owner.id })).toThrow("Self membership only");
  });
  it("keeps public joins and private requests unique under concurrency, preserves approvals, and permits rejoining after removal", async () => {
    const owner = await user(), member = await user();
    for (const visibility of ["PUBLIC", "PRIVATE"] as const) {
      const { id } = await createCommunity(db, owner.token, input(visibility));
      if (visibility === "PUBLIC") expect(await readCommunity(db, member.token, id)).toMatchObject({ membership: null });
      await Promise.all(Array.from({ length: 8 }, () => changeMembership(db, member.token, id, { action: "join" })));
      expect(await db.communityMembership.count({ where: { communityId: id, userId: member.id } })).toBe(1);
      if (visibility === "PRIVATE") {
        await Promise.all([changeMembership(db, owner.token, id, { action: "approve", userId: member.id }), changeMembership(db, member.token, id, { action: "join" })]);
      }
      expect(await readCommunity(db, member.token, id)).toMatchObject({ membership: "MEMBER" });
      await changeMembership(db, owner.token, id, { action: "remove", userId: member.id });
      if (visibility === "PRIVATE") await denied(readCommunity(db, member.token, id), 404);
      else expect(await readCommunity(db, member.token, id)).toMatchObject({ membership: null });
      await changeMembership(db, member.token, id, { action: "join" });
      expect((await db.communityMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: id, userId: member.id } } })).status).toBe(visibility === "PUBLIC" ? "MEMBER" : "PENDING");
      await Promise.all([changeMembership(db, member.token, id, { action: "leave" }), changeMembership(db, member.token, id, { action: "leave" })]);
      expect(await db.communityMembership.count({ where: { communityId: id, userId: member.id } })).toBe(0);
    }
  });
  it("rechecks membership after a real lock wait, and rechecks session expiry before committing a waiting write", async () => {
    const owner = await user(), member = await user(), { id } = await createCommunity(db, owner.token, input());
    await changeMembership(db, member.token, id, { action: "join" });
    await changeMembership(db, owner.token, id, { action: "approve", userId: member.id });
    const locker = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await locker.connect();
    try {
      await locker.query("BEGIN"); await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [id]);
      const reading = denied(readCommunity(db, member.token, id), 404);
      await waiting();
      await locker.query('DELETE FROM "CommunityMembership" WHERE "communityId" = $1 AND "userId" = $2', [id, member.id]);
      await locker.query("COMMIT"); await reading;
      await migration.query('UPDATE "Session" SET "expiresAt" = clock_timestamp() + interval \'1.5 seconds\' WHERE "tokenDigest" = $1', [digest(member.token)]);
      await locker.query("BEGIN"); await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [id]);
      const joining = denied(changeMembership(db, member.token, id, { action: "join" }), 401);
      await waiting(); await new Promise((resolve) => setTimeout(resolve, 1600));
      await locker.query("COMMIT"); await joining;
      expect(await db.communityMembership.count({ where: { communityId: id, userId: member.id } })).toBe(0);
    } finally { await locker.query("ROLLBACK"); await locker.end(); }
  });
  it("rejects absent, unknown, revoked, unverified and incomplete-profile actors for protected community operations", async () => {
    const owner = await user(), incomplete = await user(false), pending = await user(), { id } = await createCommunity(db, owner.token, input());
    await denied(discoverCommunities(db, undefined), 401);
    await denied(createCommunity(db, newToken(), input()), 401);
    await denied(createCommunity(db, incomplete.token, input()), 403);
    expect((await discoverCommunities(db, incomplete.token)).canCreate).toBe(false);
    await changeMembership(db, incomplete.token, id, { action: "join" });
    await denied(readCommunity(db, incomplete.token, id), 404);
    await migration.query('UPDATE "User" SET "emailVerifiedAt" = NULL WHERE id = $1', [pending.id]);
    await denied(readCommunity(db, pending.token, id), 401);
    await logout(db, owner.token);
    await denied(listMemberships(db, owner.token, id), 401);
    await denied(changeMembership(db, owner.token, id, { action: "remove", userId: pending.id }), 401);
  });
  it("atomically rate-limits authenticated write attempts, including rejected owner operations", async () => {
    const owner = await user(), member = await user(), { id } = await createCommunity(db, owner.token, input());
    // Non-owner failures still consume a reservation, without changing membership.
    for (let i = 0; i < 30; i++) await denied(changeMembership(db, member.token, id, { action: "remove", userId: owner.id }), 403);
    await denied(changeMembership(db, member.token, id, { action: "join" }), 429);
    expect(await db.communityMembership.count({ where: { communityId: id, userId: member.id } })).toBe(0);
    const key = digest(`m3-community-write:${member.id}`);
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(30);
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt" = now() - interval \'16 minutes\' WHERE "keyDigest" = $1', [key]);
    await changeMembership(db, member.token, id, { action: "join" });
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(1);
  });
  for (const initial of [499, 500]) {
    it(`enforces the creation membership cap starting at ${initial}, with atomic rejection and a retained attempt reservation`, async () => {
      const creator = await user();
      await seedMembershipBudget(creator.id, initial);
      expect(await db.communityMembership.count({ where: { userId: creator.id } })).toBe(initial);
      if (initial === 499) {
        const { id } = await createCommunity(db, creator.token, input());
        expect(await readCommunity(db, creator.token, id)).toMatchObject({ isOwner: true, membership: "MEMBER" });
      }
      expect(await db.communityMembership.count({ where: { userId: creator.id } })).toBe(500);
      const before = await totals();
      await denied(createCommunity(db, creator.token, input()), 429);
      expect(await totals()).toEqual(before);
      expect(await db.communityMembership.count({ where: { userId: creator.id } })).toBe(500);
      expect(await db.community.count({ where: { ownerId: creator.id } })).toBe(initial === 499 ? 1 : 0);
      expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m3-community-write:${creator.id}`) } })).hits).toBe(initial === 499 ? 2 : 1);
    });
  }
  it("preserves the separate 50-owned-community cap below the membership cap", async () => {
    const creator = await user();
    await seedMembershipBudget(creator.id, 49, 49);
    await createCommunity(db, creator.token, input());
    const before = await totals();
    await denied(createCommunity(db, creator.token, input()), 429);
    expect(await totals()).toEqual(before);
    expect(await db.community.count({ where: { ownerId: creator.id } })).toBe(50);
    expect(await db.communityMembership.count({ where: { userId: creator.id } })).toBe(50);
  });
  for (const first of ["join", "create"] as const) {
    it(`serializes competing ${first}-first join/create writes from distinct sessions at membership 499`, async () => {
      const creator = await user(), targetOwner = await user();
      await seedMembershipBudget(creator.id, 499);
      const { id } = await createCommunity(db, targetOwner.token, input("PUBLIC"));
      const secondToken = newToken();
      await migration.query('INSERT INTO "Session" (id, "userId", "tokenDigest", "expiresAt") VALUES ($1, $2, $3, now() + interval \'1 day\')', [randomUUID(), creator.id, digest(secondToken)]);
      const locker = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await locker.connect();
      const outcomes: Promise<PromiseSettledResult<unknown>>[] = [];
      const write = (action: "join" | "create", token: string) => action === "join" ? changeMembership(db, token, id, { action }) : createCommunity(db, token, input());
      const capture = (result: Promise<unknown>) => Promise.allSettled([result]).then(([outcome]) => outcome);
      const before = await totals();
      try {
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`community-budget:${creator.id}`]);
        outcomes.push(capture(write(first, creator.token)));
        await waiting();
        outcomes.push(capture(write(first === "join" ? "create" : "join", secondToken)));
        await waiting(2); // Both writes reached the real shared per-user budget lock.
        await locker.query("COMMIT");
        const [winner, loser] = await Promise.all(outcomes);
        expect(winner.status).toBe("fulfilled");
        expect(loser).toMatchObject({ status: "rejected", reason: { status: 429 } });
        expect(await db.communityMembership.count({ where: { userId: creator.id } })).toBe(500);
        expect(await db.community.count({ where: { ownerId: creator.id } })).toBe(first === "create" ? 1 : 0);
        expect(await db.communityMembership.count({ where: { communityId: id, userId: creator.id } })).toBe(first === "join" ? 1 : 0);
        expect(await totals()).toEqual([before[0] + (first === "create" ? 1 : 0), before[1] + 1]);
        expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m3-community-write:${creator.id}`) } })).hits).toBe(2);
      } finally { await locker.query("ROLLBACK"); await locker.end(); await Promise.all(outcomes); }
    });
  }
});
