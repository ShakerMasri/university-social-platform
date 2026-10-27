import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { newToken, digest } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost, listPosts, readPost } from "../../src/server/posts/service";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M3_POSTS_UPGRADE_DATABASE;
for (const target of [name, upgrade]) if (!manifest.databases.some(record => record.name === target && record.kind === "test" && record.ready)) throw new Error("Owned posts test targets required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const options = { domains: ["university.test"], rateKey: randomBytes(32).toString("hex") }; let sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const email = `post.${randomUUID()}@university.test`, browser = newToken(), ip = `203.0.113.${++sequence}`;
  let token = "";
  await requestSignIn(db, options, { email, browser, ip }, async message => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic post identity failed");
  if (profile) await updateOwnProfile(db, session.token, "كاتب Author 😀");
  const user = await db.user.findUniqueOrThrow({ where: { emailKey: email } });
  return { id: user.id, token: session.token };
}
const content = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), type: "QUESTION", title: "سؤال Question", body: "English / عربي\nUseful discussion", ...extra });
const deny = (result: Promise<unknown>, status: number) => expect(result).rejects.toMatchObject({ status });
async function community(owner: Awaited<ReturnType<typeof actor>>, visibility = "PRIVATE") {
  return createCommunity(db, owner.token, { name: "Post community", description: "", visibility });
}
async function waiting(expected: number) {
  for (let i = 0; i < 150; i++) {
    await migration.query("SELECT pg_stat_clear_snapshot()");
    const row = await migration.query<{ count: string }>("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
    if (Number(row.rows[0].count) >= expected) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected real post/community lock contention");
}
async function locker(id: string) {
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url }); await client.connect(); await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [id]);
  return client;
}

describe("M3 posts on disposable PostgreSQL", () => {
  it("adds posts without changing populated M2/M3 history", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of ["20261009000000_m1b_foundation", "20261009010000_m1b_email_case_contract", "20261010000000_m2_identity", "20261010010000_m3_communities"]) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), space = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt","emailVerifiedAt") VALUES ($1,$2,$2,now(),now())', [user, "posts-upgrade@university.test"]);
      await client.query('INSERT INTO "Profile" ("userId","displayName","updatedAt") VALUES ($1,\'Upgrade author\',now())', [user]);
      await client.query('INSERT INTO "Session" (id,"userId","tokenDigest","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')', [randomUUID(), user, digest(newToken())]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Prior community\',\'\',\'PRIVATE\')', [space, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [space, user]);
      const snapshot = async () => (await client.query('SELECT (SELECT json_agg(u) FROM "User" u) u,(SELECT json_agg(p) FROM "Profile" p) p,(SELECT json_agg(s) FROM "Session" s) s,(SELECT json_agg(c) FROM "Community" c) c,(SELECT json_agg(m) FROM "CommunityMembership" m) m')).rows;
      const before = JSON.stringify(await snapshot());
      await client.query(readFileSync("prisma/migrations/20261026000000_m3_posts/migration.sql", "utf8"));
      expect(JSON.stringify(await snapshot()) === before).toBe(true);
      expect((await client.query('SELECT count(*) FROM "Post"')).rows[0].count).toBe("0");
    } finally { await client.end(); }
  });

  it("enforces member/profile publishing, creator-only announcements, public reads and private revocation", async () => {
    const owner = await actor(), member = await actor(), incomplete = await actor(false), stranger = await actor();
    const publicSpace = await community(owner, "PUBLIC"), privateSpace = await community(owner);
    await deny(createPost(db, newToken(), publicSpace.id, content()), 401);
    await deny(createPost(db, stranger.token, publicSpace.id, content()), 403);
    await changeMembership(db, incomplete.token, publicSpace.id, { action: "join" });
    await deny(createPost(db, incomplete.token, publicSpace.id, content()), 403);
    expect((await listPosts(db, stranger.token, publicSpace.id)).canPost).toBe(false);
    await changeMembership(db, member.token, publicSpace.id, { action: "join" });
    for (const type of ["QUESTION", "DISCUSSION", "RESOURCE"]) {
      const post = await createPost(db, member.token, publicSpace.id, content({ type, ...(type === "RESOURCE" ? { resourceUrl: "https://example.test/notes" } : {}) }));
      expect((await readPost(db, stranger.token, publicSpace.id, post.id)).type).toBe(type);
    }
    await deny(createPost(db, member.token, publicSpace.id, content({ type: "ANNOUNCEMENT" })), 403);
    const announcement = await createPost(db, owner.token, publicSpace.id, content({ type: "ANNOUNCEMENT" }));
    expect((await readPost(db, stranger.token, publicSpace.id, announcement.id)).type).toBe("ANNOUNCEMENT");
    const privatePost = await createPost(db, owner.token, privateSpace.id, content());
    await deny(listPosts(db, member.token, privateSpace.id), 404);
    await changeMembership(db, member.token, privateSpace.id, { action: "join" });
    await deny(readPost(db, member.token, privateSpace.id, privatePost.id), 404);
    await changeMembership(db, owner.token, privateSpace.id, { action: "approve", userId: member.id });
    expect((await readPost(db, member.token, privateSpace.id, privatePost.id)).id).toBe(privatePost.id);
    await changeMembership(db, owner.token, privateSpace.id, { action: "remove", userId: member.id });
    await deny(readPost(db, member.token, privateSpace.id, privatePost.id), 404);
    await deny(createPost(db, member.token, privateSpace.id, content()), 404);
  });

  it("makes concurrent retries idempotent and rejects a changed body under the same request ID", async () => {
    const owner = await actor(), space = await community(owner), input = content();
    const results = await Promise.all([createPost(db, owner.token, space.id, input), createPost(db, owner.token, space.id, input)]);
    expect(results[0].id === results[1].id).toBe(true);
    expect(await db.post.count({ where: { communityId: space.id } })).toBe(1);
    await deny(createPost(db, owner.token, space.id, { ...input, body: "Changed" }), 409);
    const read = await readPost(db, owner.token, space.id, results[0].id);
    expect(Object.keys(read).sort()).toEqual(["authorName", "body", "communityId", "createdAt", "id", "resourceUrl", "title", "type"].sort());
  });

  it("paginates tied timestamps without duplicates and scopes detail and cursors to their community", async () => {
    const owner = await actor(), space = await community(owner), other = await community(owner);
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',\'Page item\',\'Synthetic text\' FROM unnest($1::uuid[]) id', [ids, space.id, owner.id]);
    const first = await listPosts(db, owner.token, space.id), second = await listPosts(db, owner.token, space.id, first.next);
    expect(first.items.length).toBe(20); expect(second.items.length).toBe(3); expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map(post => post.id)).size).toBe(23);
    await deny(readPost(db, owner.token, other.id, ids[0]), 404);
    await deny(listPosts(db, owner.token, other.id, ids[0]), 404);
  });

  it("rolls back a post when the session expires during an actual community lock wait", async () => {
    const owner = await actor(), space = await community(owner), block = await locker(space.id), input = content();
    let outcome: Promise<{ succeeded: boolean; status?: number }> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(owner.token)]);
      outcome = createPost(db, owner.token, space.id, input).then(() => ({ succeeded: true }), (error: { status?: number }) => ({ succeeded: false, status: error.status }));
      await waiting(1);
      for (;;) {
        const row = await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(owner.token)]);
        if (row.rows[0].expired) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await block.query("COMMIT");
      expect(await outcome).toEqual({ succeeded: false, status: 401 });
      expect(await db.post.count({ where: { communityId: space.id } })).toBe(0);
    } finally { await block.query("ROLLBACK"); await block.end(); await outcome; }
  });

  it("denies a queued private read after membership removal wins the same real lock queue", async () => {
    const owner = await actor(), member = await actor(), space = await community(owner);
    await changeMembership(db, member.token, space.id, { action: "join" });
    await changeMembership(db, owner.token, space.id, { action: "approve", userId: member.id });
    const post = await createPost(db, owner.token, space.id, content()), block = await locker(space.id);
    let removal: Promise<unknown> | undefined, read: Promise<{ allowed: boolean; status?: number }> | undefined;
    try {
      removal = changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id });
      await waiting(1);
      read = readPost(db, member.token, space.id, post.id).then(() => ({ allowed: true }), (error: { status?: number }) => ({ allowed: false, status: error.status }));
      await waiting(2); await block.query("COMMIT"); await removal;
      expect(await read).toEqual({ allowed: false, status: 404 });
    } finally { await block.query("ROLLBACK"); await block.end(); await removal; await read; }
  });

  it("enforces SQL checks, reference integrity and no runtime edit/delete grants; preserves posts after author unlink", async () => {
    const owner = await actor(), space = await community(owner), post = await createPost(db, owner.token, space.id, content());
    const runtime = new Client({ connectionString: databaseUrl(manifest, name!, "runtime") }); await runtime.connect();
    try {
      for (const sql of ['UPDATE "Post" SET title=\'Hijack\'', 'DELETE FROM "Post"']) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    await expect(migration.query('INSERT INTO "Post" (id,"communityId",type,title,body) VALUES ($1,$2,\'QUESTION\',\'\',\'Text\')', [randomUUID(), space.id])).rejects.toMatchObject({ code: "23514" });
    await expect(migration.query('INSERT INTO "Post" (id,"communityId",type,title,body,"resourceUrl") VALUES ($1,$2,\'RESOURCE\',\'Title\',\'Text\',\'javascript:alert(1)\')', [randomUUID(), space.id])).rejects.toMatchObject({ code: "23514" });
    const bare = randomUUID(), detached = randomUUID();
    await migration.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [bare, `detached.${bare}@university.test`]);
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'DISCUSSION\',\'Archive\',\'Keep learning content\')', [detached, space.id, bare]);
    await migration.query('DELETE FROM "User" WHERE id=$1', [bare]);
    expect((await db.post.findUniqueOrThrow({ where: { id: detached } })).authorId).toBeNull();
    expect((await readPost(db, owner.token, space.id, detached)).authorName).toBeNull();
    expect((await readPost(db, owner.token, space.id, post.id)).id).toBe(post.id);
  });
});
