import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { newToken, digest } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost } from "../../src/server/posts/service";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M3_COMMENTS_UPGRADE_DATABASE;
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
const postContent = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), type: "QUESTION", title: "سؤال Question", body: "English / عربي\nUseful discussion", ...extra });
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


const content = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), body: "تعليق Comment 😀", ...extra });
import { createComment, listComments } from "../../src/server/comments/service";

describe("comments on disposable PostgreSQL", () => {
  it("upgrades populated post history without changing existing records", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of ["20261009000000_m1b_foundation", "20261009010000_m1b_email_case_contract", "20261010000000_m2_identity", "20261010010000_m3_communities", "20261026000000_m3_posts"]) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), space = randomUUID(), post = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [user, "comments-upgrade@university.test"]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Existing\',\'\',\'PRIVATE\')', [space, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [space, user]);
      await client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'QUESTION\',\'Existing\',\'Preserved\')', [post, space, user]);
      const snapshot = async () => (await client.query('SELECT (SELECT json_agg(u) FROM "User" u) u,(SELECT json_agg(c) FROM "Community" c) c,(SELECT json_agg(m) FROM "CommunityMembership" m) m,(SELECT json_agg(p) FROM "Post" p) p')).rows;
      const before = JSON.stringify(await snapshot());
      await client.query(readFileSync("prisma/migrations/20261027000000_m3_comments/migration.sql", "utf8"));
      expect(JSON.stringify(await snapshot()) === before).toBe(true);
      expect((await client.query('SELECT count(*) FROM "Comment"')).rows[0].count).toBe("0");
    } finally { await client.end(); }
  });

  it("requires session/profile/membership for all types and rechecks public/private retries after removal", async () => {
    const owner = await actor(), member = await actor(), incomplete = await actor(false);
    for (const visibility of ["PUBLIC", "PRIVATE"]) {
      const space = await community(owner, visibility);
      const post = await createPost(db, owner.token, space.id, postContent());
      await deny(listComments(db, newToken(), space.id, post.id), 401);
      await deny(createComment(db, member.token, space.id, post.id, content()), visibility === "PUBLIC" ? 403 : 404);
      await changeMembership(db, member.token, space.id, { action: "join" });
      await changeMembership(db, incomplete.token, space.id, { action: "join" });
      if (visibility === "PRIVATE") {
        await deny(listComments(db, member.token, space.id, post.id), 404);
        await deny(createComment(db, member.token, space.id, post.id, content()), 404);
        for (const userId of [member.id, incomplete.id]) await changeMembership(db, owner.token, space.id, { action: "approve", userId });
      }
      await deny(createComment(db, incomplete.token, space.id, post.id, content()), 403);
      const data = content(); await createComment(db, member.token, space.id, post.id, data);
      for (const type of ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"]) {
        const parent = await createPost(db, owner.token, space.id, postContent({ type }));
        await createComment(db, member.token, space.id, parent.id, content());
      }
      await changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id });
      await deny(createComment(db, member.token, space.id, post.id, data), visibility === "PUBLIC" ? 403 : 404);
      if (visibility === "PRIVATE") await deny(listComments(db, member.token, space.id, post.id), 404);
      else expect((await listComments(db, member.token, space.id, post.id)).canComment).toBe(false);
    }
  });

  it("deduplicates concurrent retries, conflicts on changes and scopes keys to actor and post", async () => {
    const owner = await actor(), member = await actor(), space = await community(owner, "PUBLIC");
    await changeMembership(db, member.token, space.id, { action: "join" });
    const post = await createPost(db, owner.token, space.id, postContent()), other = await createPost(db, owner.token, space.id, postContent()), data = content();
    // Separate sessions for one actor avoid serializing the race on Session first.
    const secondSession = newToken();
    await migration.query('INSERT INTO "Session" (id,"userId","tokenDigest","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')', [randomUUID(), owner.id, digest(secondSession)]);
    const results = await Promise.all([createComment(db, owner.token, space.id, post.id, data), createComment(db, secondSession, space.id, post.id, data)]);
    expect(results[0].id === results[1].id).toBe(true);
    expect(Object.keys(results[0]).sort()).toEqual(["authorName", "body", "createdAt", "id", "replyToId", "replyToName", "rootId", "vote"]);
    expect(results[1]).toEqual(results[0]);
    await deny(createComment(db, owner.token, space.id, post.id, { ...data, body: "Changed" }), 409);
    expect((await createComment(db, member.token, space.id, post.id, data)).id === results[0].id).toBe(false);
    expect((await createComment(db, owner.token, space.id, other.id, data)).id === results[0].id).toBe(false);
    expect(await db.comment.count({ where: { postId: post.id } })).toBe(2);
    const listing = await listComments(db, owner.token, space.id, post.id);
    expect(Object.keys(listing.items[0]).sort()).toEqual(["authorName", "body", "createdAt", "id", "replyToId", "replyToName", "rootId", "vote"]);
  });

  it("paginates tied timestamps oldest first and rejects cross-parent/community cursors", async () => {
    const owner = await actor(), space = await community(owner), other = await community(owner);
    const post = await createPost(db, owner.token, space.id, postContent()), secondPost = await createPost(db, owner.token, space.id, postContent());
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Page\' FROM unnest($1::uuid[]) id', [ids, post.id, owner.id]);
    const first = await listComments(db, owner.token, space.id, post.id), second = await listComments(db, owner.token, space.id, post.id, first.next);
    expect(first.items.length).toBe(20); expect(second.items.length).toBe(3); expect(second.next).toBeNull();
    expect([...first.items, ...second.items].map(item => item.id)).toEqual(ids.sort());
    await deny(listComments(db, owner.token, space.id, secondPost.id, first.next), 404);
    await deny(listComments(db, owner.token, other.id, post.id), 404);
    await deny(createComment(db, owner.token, other.id, post.id, content()), 404);
  });

  it("preserves maximum-length Unicode text and its retry identity through PostgreSQL", async () => {
    const owner = await actor(), space = await community(owner), post = await createPost(db, owner.token, space.id, postContent());
    const data = content({ body: ` \n${"😀".repeat(4000)}\t ` });
    const saved = await createComment(db, owner.token, space.id, post.id, data);
    expect(await createComment(db, owner.token, space.id, post.id, data)).toEqual(saved);
    const listing = await listComments(db, owner.token, space.id, post.id);
    expect(listing.items).toHaveLength(1);
    expect(listing.items[0].body === "😀".repeat(4000)).toBe(true);
  });

  it("reserves rejected attempts durably under a separate budget and resets after 15 minutes", async () => {
    const owner = await actor(), stranger = await actor(), space = await community(owner, "PUBLIC"), post = await createPost(db, owner.token, space.id, postContent());
    const key = digest(`m3-comment-write:${stranger.id}`);
    await migration.query('INSERT INTO "IdentityRateLimit" ("keyDigest",hits) VALUES ($1,29)', [key]);
    await deny(createComment(db, stranger.token, space.id, post.id, content()), 403);
    await changeMembership(db, stranger.token, space.id, { action: "join" });
    await deny(createComment(db, stranger.token, space.id, post.id, content()), 429);
    await createPost(db, stranger.token, space.id, postContent());
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\' WHERE "keyDigest"=$1', [key]);
    await createComment(db, stranger.token, space.id, post.id, content());
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(1);
  });

  it("rolls back when a session expires during the community lock wait", async () => {
    const owner = await actor(), space = await community(owner), post = await createPost(db, owner.token, space.id, postContent()), block = await locker(space.id);
    let outcome: Promise<{ succeeded: boolean; status?: number }> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(owner.token)]);
      outcome = createComment(db, owner.token, space.id, post.id, content()).then(() => ({ succeeded: true }), (error: { status?: number }) => ({ succeeded: false, status: error.status }));
      await waiting(1);
      for (;;) {
        const row = await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(owner.token)]);
        if (row.rows[0].expired) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await block.query("COMMIT"); expect(await outcome).toEqual({ succeeded: false, status: 401 });
      expect(await db.comment.count({ where: { postId: post.id } })).toBe(0);
    } finally { await block.query("ROLLBACK"); await block.end(); await outcome; }
  });

  it.each(["read", "retry"])("denies queued %s when removal wins the real community lock queue", async (operation) => {
    const owner = await actor(), member = await actor(), space = await community(owner);
    await changeMembership(db, member.token, space.id, { action: "join" });
    await changeMembership(db, owner.token, space.id, { action: "approve", userId: member.id });
    const post = await createPost(db, owner.token, space.id, postContent()), data = content();
    await createComment(db, member.token, space.id, post.id, data);
    const block = await locker(space.id); let removal: Promise<unknown> | undefined;
    let pending: Promise<unknown> | undefined;
    const status = (promise: Promise<unknown>) => promise.then(() => 200, (error: { status: number }) => error.status);
    try {
      removal = changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id }); await waiting(1);
      pending = status(operation === "read" ? listComments(db, member.token, space.id, post.id) : createComment(db, member.token, space.id, post.id, data));
      await waiting(2);
      await block.query("COMMIT"); await removal;
      expect(await pending).toBe(404);
      expect(await db.comment.count({ where: { postId: post.id } })).toBe(1);
    } finally { await block.query("ROLLBACK"); await block.end(); await Promise.all([removal, pending]); }
  });

  it("enforces SQL constraints and runtime grants, restricts parent deletion and preserves unlinked attribution", async () => {
    const owner = await actor(), space = await community(owner), post = await createPost(db, owner.token, space.id, postContent());
    const comment = await createComment(db, owner.token, space.id, post.id, content());
    const runtime = new Client({ connectionString: databaseUrl(manifest, name!, "runtime") }); await runtime.connect();
    try {
      for (const sql of ['UPDATE "Comment" SET body=\'Hijack\'', 'DELETE FROM "Comment"']) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    const insert = (parent: string, author: string, body: string, key = digest(newToken())) => migration.query('INSERT INTO "Comment" (id,"postId","authorId",body,"submissionKey") VALUES ($1,$2,$3,$4,$5)', [randomUUID(), parent, author, body, key]);
    for (const body of ["", " \t\n", "bad\u0001text"]) await expect(insert(post.id, owner.id, body)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(post.id, owner.id, "x".repeat(4001))).rejects.toMatchObject({ code: "22001" });
    await expect(insert(randomUUID(), owner.id, "x")).rejects.toMatchObject({ code: "23503" });
    await expect(insert(post.id, randomUUID(), "x")).rejects.toMatchObject({ code: "23503" });
    const saved = await db.comment.findUniqueOrThrow({ where: { id: comment.id } });
    await expect(insert(post.id, owner.id, "x", saved.submissionKey)).rejects.toMatchObject({ code: "23505" });
    await expect(migration.query('DELETE FROM "Post" WHERE id=$1', [post.id])).rejects.toMatchObject({ code: "23001" });
    const bare = randomUUID(); await migration.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [bare, `detached.${bare}@university.test`]);
    await insert(post.id, bare, "Preserved"); await migration.query('DELETE FROM "User" WHERE id=$1', [bare]);
    expect((await listComments(db, owner.token, space.id, post.id)).items.find(item => item.body === "Preserved")?.authorName).toBeNull();
  });
});
