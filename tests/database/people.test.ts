import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile, logout } from "../../src/server/identity/service";
import { newToken, digest } from "../../src/server/identity/policy";
import { ownDirectoryProfile, saveDirectoryProfile, searchPeople, readDirectoryProfile, peopleCandidateQuery } from "../../src/server/profiles/service";
import { Prisma } from "../../src/generated/prisma/client";
import { peopleInput } from "../../src/server/profiles/policy";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M4_PEOPLE_UPGRADE_DATABASE;
for (const target of [name, upgrade]) if (!manifest.databases.some(record => record.name === target && record.kind === "test" && record.ready)) throw new Error("Owned disposable people targets required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const key = randomBytes(32).toString("hex"), options = { domains: ["university.test"], rateKey: key }; let sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor() {
  const email = `people.${randomUUID()}@university.test`, browser = newToken(); let token = "";
  const ip = `198.18.1.${++sequence}`;
  await requestSignIn(db, options, { email, browser, ip }, async message => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic people identity failed");
  return { token: session.token, id: (await db.user.findUniqueOrThrow({ where: { emailKey: email } })).id };
}
const deny = (result: Promise<unknown>, status: number) => expect(result).rejects.toMatchObject({ status });
const save = (user: { token: string }, displayName: string, directoryVisible = true) => saveDirectoryProfile(db, user.token, { displayName, directoryVisible });
const search = (user: { token: string }, q: string, after?: string) => searchPeople(db, user.token, peopleInput(new URLSearchParams({ q, ...(after ? { after } : {}) })), key);
async function blocker(userId: string) {
  const client = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await client.connect();
  await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [`profile-directory:${userId}`]);
  return client;
}
async function waitForBlock(client: Client) {
  const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  for (let i = 0; i < 120; i++) {
    const result = await migration.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))) AS blocked", [pid]);
    if (result.rows[0].blocked) return;
    await new Promise(done => setTimeout(done, 20));
  }
  throw new Error("Expected a real profile lock wait");
}
describe("permission-aware people discovery", () => {
  it("review regression: mixed legacy and People saves charge one shared budget across sessions", async () => {
    const owner = await actor(), secondToken = newToken();
    await db.session.create({ data: { userId: owner.id, tokenDigest: digest(secondToken), expiresAt: new Date(Date.now() + 86400000) } });
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) await save(owner, `Shared budget ${i}`);
      else expect(await updateOwnProfile(db, secondToken, `Shared budget ${i}`)).toBe(true);
    }
    const counter = await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-profile-save:${owner.id}`) } });
    expect(counter.hits).toBe(30);
    const before = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
    await deny(updateOwnProfile(db, owner.token, "Legacy beyond limit"), 429);
    await deny(save({ token: secondToken }, "People beyond limit", false), 429);
    expect(await db.profile.findUniqueOrThrow({ where: { userId: owner.id } })).toEqual(before);
    expect((await search(owner, "Shared budget")).items.some(item => item.id === before.directoryId)).toBe(true);
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-profile-save:${owner.id}`) } })).hits).toBe(30);
  });
  it("review regression: independent clients compete for one remaining profile-save slot under real PostgreSQL locks", async () => {
    const owner = await actor(), secondToken = newToken();
    await db.session.create({ data: { userId: owner.id, tokenDigest: digest(secondToken), expiresAt: new Date(Date.now() + 86400000) } });
    for (let i = 0; i < 29; i++) await save(owner, "Concurrent profile");
    const clients = await Promise.all([createLocalDatabase(databaseUrl(manifest, name!, "runtime")), createLocalDatabase(databaseUrl(manifest, name!, "runtime"))]);
    const locker = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await locker.connect();
    let outcomes: Promise<{ accepted: boolean; status?: number }>[] = [];
    try {
      await locker.query("BEGIN");
      await locker.query('SELECT "keyDigest" FROM "IdentityRateLimit" WHERE "keyDigest"=$1 FOR UPDATE', [digest(`m4-profile-save:${owner.id}`)]);
      outcomes = [updateOwnProfile(clients[0], owner.token, "Legacy wins"), saveDirectoryProfile(clients[1], secondToken, { displayName: "People wins", directoryVisible: true })]
        .map(attempt => attempt.then(value => ({ accepted: value !== false }), error => ({ accepted: false, status: error.status as number })));
      let waiting = 0;
      for (let i = 0; i < 120; i++) {
        // Cross-role query text is deliberately restricted. Observe real waiters
        // in this sequential disposable fixture without reading their SQL.
        waiting = Number((await migration.query<{ count: string }>("SELECT count(DISTINCT a.pid) FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND NOT l.granted")).rows[0].count);
        if (waiting === 2) break;
        await new Promise(done => setTimeout(done, 20));
      }
      expect(waiting).toBe(2); // Both separate sessions actually reached the durable counter wait.
      await locker.query("COMMIT");
      const results = await Promise.all(outcomes);
      expect(results.filter(result => result.accepted)).toHaveLength(1);
      expect(results.filter(result => result.status === 429)).toHaveLength(1);
      expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-profile-save:${owner.id}`) } })).hits).toBe(30);
      const stored = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
      expect(["Legacy wins", "People wins"]).toContain(stored.displayName); expect(stored.directoryVisible).toBe(true);
    } finally { await locker.query("ROLLBACK"); await Promise.all(outcomes); await locker.end(); await Promise.all(clients.map(client => client.$disconnect())); }
  });
  it("review regression: direct legacy writer rejects invalid directory names without changing persistence or projection", async () => {
    const owner = await actor(), reader = await actor(), marker = `Valid${randomUUID().slice(0, 8)}`;
    await save(owner, `${marker} أحمد Ali 😀`);
    const before = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
    for (const control of ["\t", "\n", "\u007f", "\u202e", "\u2066", "\u200b"]) {
      const rejected = await Promise.resolve().then(() => updateOwnProfile(db, owner.token, `${marker} A${control}B`)).then(() => false, () => true);
      expect(rejected).toBe(true);
      await expect(save(owner, `${marker} A${control}B`, false)).rejects.toThrow();
    }
    expect(await db.profile.findUniqueOrThrow({ where: { userId: owner.id } })).toEqual(before);
    expect((await search(reader, marker)).items).toEqual([{ id: before.directoryId, displayName: before.displayName }]);
    expect(await readDirectoryProfile(db, reader.token, before.directoryId)).toEqual({ id: before.directoryId, displayName: before.displayName });
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: digest(`m4-profile-save:${owner.id}`) } })).hits).toBe(1);
  });
  it("keeps unsaved/existing profiles hidden until explicit confirmation, preserving names and stable destinations", async () => {
    const owner = await actor(), reader = await actor(), marker = `Name${randomUUID()}`;
    const first = await ownDirectoryProfile(db, owner.token), second = await ownDirectoryProfile(db, owner.token);
    expect(first.displayName).toBeNull(); expect(first.directoryVisible).toBe(false); expect(first.suggestion).toBe(second.suggestion);
    expect(await db.profile.count({ where: { userId: owner.id } })).toBe(0);
    await updateOwnProfile(db, owner.token, marker);
    expect((await search(reader, marker)).items).toEqual([]);
    await save(owner, marker);
    const profile = (await search(reader, marker)).items[0];
    expect(Object.keys(profile).sort()).toEqual(["displayName", "id"]); expect(profile.id).not.toBe(owner.id);
    expect(await readDirectoryProfile(db, reader.token, profile.id)).toEqual(profile);
    await save(owner, marker, false); await deny(readDirectoryProfile(db, reader.token, profile.id), 404);
    expect((await search(reader, marker)).items).toEqual([]);
    await save(owner, marker); expect((await search(reader, marker)).items[0]).toEqual(profile);
    await updateOwnProfile(db, owner.token, `${marker}X`); // legacy writes keep the explicit visibility choice
    expect((await readDirectoryProfile(db, reader.token, profile.id)).displayName).toBe(`${marker}X`);
    expect(await db.communityMembership.count({ where: { userId: { in: [owner.id, reader.id] } } })).toBe(0);
  });
  it("matches Arabic/English and literal punctuation, excluding hidden and unverified users before projection", async () => {
    const owner = await actor(), reader = await actor(), marker = randomUUID().slice(0, 8);
    await save(owner, `أَحْـمَد ALI ${marker} C%_++`);
    expect((await search(reader, `أحمد ali ${marker}`)).items).toHaveLength(1);
    expect((await search(reader, `${marker} c%_++`)).items).toHaveLength(1);
    expect((await search(reader, `${marker} c++`)).items).toHaveLength(0);
    await migration.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [owner.id]);
    expect((await search(reader, marker)).items).toHaveLength(0);
    await deny(search(owner, marker), 401); await deny(search({ token: newToken() }, marker), 401);
    await logout(db, reader.token); await deny(search(reader, marker), 401);
  });
  it("paginates duplicate names and rejects cross-user/query cursors and hidden or renamed anchors", async () => {
    const owner = await actor(), reader = await actor(), other = await actor(), marker = `Page${randomUUID()}`;
    const ids = Array.from({ length: 23 }, () => randomUUID()).sort();
    for (const id of ids) {
      await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, `${id}@university.test`]);
      await migration.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") VALUES ($1,$2,true,now())', [id, marker]);
    }
    const first = await search(reader, marker), second = await search(reader, marker, first.next!);
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(23);
    await expect(search(other, marker, first.next!)).rejects.toThrow("Restart people search");
    await expect(search(reader, "Changed", first.next!)).rejects.toThrow("Restart people search");
    const anchorId = first.items.at(-1)!.id;
    await migration.query('UPDATE "Profile" SET "directoryVisible"=false WHERE "directoryId"=$1', [anchorId]);
    await deny(search(reader, marker, first.next!), 404);
    await migration.query('UPDATE "Profile" SET "directoryVisible"=true,"displayName"=\'Changed\' WHERE "directoryId"=$1', [anchorId]);
    await deny(search(reader, marker, first.next!), 404);
    await save(owner, "Unrelated");
  });
  it("rechecks hidden detail and search candidates after actual lock waits", async () => {
    for (const detail of [false, true]) {
      const owner = await actor(), reader = await actor(), marker = `Race${randomUUID()}`; await save(owner, marker);
      const profile = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
      const lock = await blocker(owner.id);
      const pending = detail ? readDirectoryProfile(db, reader.token, profile.directoryId) : search(reader, marker);
      const outcome = pending.then(value => ({ value, status: 200 }), error => ({ value: null, status: error.status as number }));
      try {
        await waitForBlock(lock);
        await lock.query('UPDATE "Profile" SET "directoryVisible"=false WHERE "userId"=$1', [owner.id]);
        await lock.query("COMMIT"); const result = await outcome;
        if (detail) expect(result.status).toBe(404);
        else expect(result.value).toEqual({ items: [], next: null });
      } finally { await lock.query("ROLLBACK"); await lock.end(); await outcome; }
    }
  });
  it("does not derive a next cursor from a lookahead hidden while waiting", async () => {
    const owner = await actor(), reader = await actor(), marker = `Look${randomUUID()}`; await save(owner, marker);
    await migration.query('UPDATE "Profile" SET "directoryId"=\'ffffffff-ffff-ffff-ffff-ffffffffffff\' WHERE "userId"=$1', [owner.id]);
    for (let i = 0; i < 20; i++) {
      const id = randomUUID();
      await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, `${id}@university.test`]);
      await migration.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") VALUES ($1,$2,true,now())', [id, marker]);
    }
    const lock = await blocker(owner.id), attempt = search(reader, marker);
    const outcome = attempt.then(value => ({ value }), () => ({ value: null }));
    try {
      await waitForBlock(lock); await lock.query('UPDATE "Profile" SET "directoryVisible"=false WHERE "userId"=$1', [owner.id]);
      await lock.query("COMMIT"); const result = (await outcome).value;
      expect(result?.items).toHaveLength(20); expect(result?.next).toBeNull();
      expect(result?.items.some(item => item.id === "ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(false);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await outcome; }
  });
  it("rolls back name and visibility when the actor expires while waiting for the profile lock", async () => {
    const owner = await actor(); await save(owner, "Before", false);
    const before = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
    await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'1.5 seconds\' WHERE "tokenDigest"=$1', [digest(owner.token)]);
    const lock = await blocker(owner.id), attempt = save(owner, "After", true);
    const outcome = attempt.then(() => 200, error => error.status as number);
    try {
      await waitForBlock(lock);
      for (let i = 0; i < 120; i++) {
        if ((await migration.query<{ expired: boolean }>('SELECT "expiresAt"<=clock_timestamp() AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(owner.token)])).rows[0].expired) break;
        await new Promise(done => setTimeout(done, 20));
      }
      await lock.query("COMMIT"); expect(await outcome).toBe(401);
      expect(await db.profile.findUniqueOrThrow({ where: { userId: owner.id } })).toEqual(before);
    } finally { await lock.query("ROLLBACK"); await lock.end(); await outcome; }
  });
  it("persists denied read budgets and leaves the separate visibility-save budget available", async () => {
    const owner = await actor();
    const results = await Promise.all(Array.from({ length: 32 }, () => readDirectoryProfile(db, owner.token, randomUUID()).then(() => 200, error => error.status as number)));
    expect(results.filter(status => status === 404)).toHaveLength(30); expect(results.filter(status => status === 429)).toHaveLength(2);
    await save(owner, "Can hide", false);
    expect((await ownDirectoryProfile(db, owner.token)).directoryVisible).toBe(false);
  });
  it("restricts runtime grants, enforces independent profile IDs and preserves persisted labels across connections", async () => {
    const owner = await actor(); await save(owner, "Member stable", true);
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
    const runtime = new Client({ connectionString: databaseUrl(manifest, name!, "runtime") }); await runtime.connect();
    try {
      for (const sql of ['UPDATE "Profile" SET "directoryId"=gen_random_uuid()', 'UPDATE "Profile" SET "userId"=gen_random_uuid()', 'DELETE FROM "Profile"']) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
      const persisted = (await runtime.query('SELECT "displayName","directoryVisible","directoryId" FROM "Profile" WHERE "userId"=$1', [owner.id])).rows[0];
      expect(persisted).toEqual({ displayName: profile.displayName, directoryVisible: true, directoryId: profile.directoryId });
      const other = await actor(); await updateOwnProfile(db, other.token, "Other");
      await expect(migration.query('UPDATE "Profile" SET "directoryId"=$1 WHERE "userId"=$2', [profile.directoryId, other.id])).rejects.toMatchObject({ code: "23505" });
    } finally { await runtime.end(); }
  });
  it("upgrades populated profiles without opting in or changing existing attribution/content", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      const migrationName = "20261105000000_m4_people";
      for (const file of readdirSync("prisma/migrations").filter(file => /^\d/.test(file) && file < migrationName).sort()) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), community = randomUUID(), post = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [user, "people-upgrade@university.test"]);
      await client.query('INSERT INTO "Profile" ("userId","displayName","updatedAt") VALUES ($1,\'اسم محفوظ Existing\',now())', [user]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Preserved\',\'\',\'PRIVATE\')', [community, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [community, user]);
      await client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'QUESTION\',\'Existing\',\'Preserved\')', [post, community, user]);
      const snapshot = async () => {
        const rows = [];
        for (const sql of ['SELECT * FROM "User"', 'SELECT "userId","displayName","createdAt","updatedAt" FROM "Profile"', 'SELECT * FROM "Community"', 'SELECT * FROM "CommunityMembership"', 'SELECT * FROM "Post"']) rows.push((await client.query(sql)).rows);
        return rows;
      };
      const before = await snapshot(); await client.query(readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8"));
      expect(await snapshot()).toEqual(before);
      const profile = (await client.query('SELECT "directoryId","directoryVisible" FROM "Profile"')).rows[0];
      expect(profile.directoryVisible).toBe(false); expect(profile.directoryId).toMatch(/^[0-9a-f-]{36}$/); expect(profile.directoryId).not.toBe(user);
    } finally { await client.end(); }
  });
  it("records bounded candidate plans on a synthetic profile corpus without adding a speculative text index", async () => {
    const ids = Array.from({ length: 2000 }, () => randomUUID()), marker = randomUUID().slice(0, 8);
    await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") SELECT id,id::text||\'@university.test\',id::text||\'@university.test\',now(),now() FROM unnest($1::uuid[]) id', [ids]);
    await migration.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") SELECT id,$2::text||CASE WHEN ord%2=0 THEN \' Ahmad أحمد\' ELSE \' Samir سمير\' END, ord%3<>0,now() FROM unnest($1::uuid[]) WITH ORDINALITY x(id,ord)', [ids, marker]);
    for (const [kind, query] of [["broad", marker], ["arabic", `${marker} ahmad أحمد`], ["no-match", `${marker} absent`]]) {
      const input = peopleInput(new URLSearchParams({ q: query }));
      const plan = await db.$queryRaw<{ "QUERY PLAN": { Plan: { "Actual Rows": number; "Node Type": string }; "Execution Time": number }[] }[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${peopleCandidateQuery(input)}`);
      const result = plan[0]["QUERY PLAN"][0];
      expect(result.Plan["Node Type"]).toBe("Limit"); expect(result.Plan["Actual Rows"]).toBeLessThanOrEqual(21);
      console.info("Synthetic people candidate plan", { kind, addedProfiles: ids.length, rows: result.Plan["Actual Rows"], executionMs: result["Execution Time"] });
    }
  });
});
