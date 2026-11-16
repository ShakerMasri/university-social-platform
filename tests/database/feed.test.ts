import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile, logout } from "../../src/server/identity/service";
import { digest, newToken } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost } from "../../src/server/posts/service";
import { listFeed } from "../../src/server/feed/service";
import { feedCursor } from "../../src/server/feed/policy";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M4_FEED_DATABASE;
if (!manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh guarded feed test target required");
const key = randomBytes(32).toString("hex"), options = { domains: ["university.test"], rateKey: key };
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client, sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
  if ((await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count !== 0) throw new Error("Feed target must be fresh; no clearing or adoption");
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const email = `feed.${randomUUID()}@university.test`, browser = newToken(), ip = `198.51.100.${++sequence}`; let token = "";
  await requestSignIn(db, options, { email, browser, ip }, async message => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic feed actor failed");
  if (profile) await updateOwnProfile(db, session.token, "دارس Feed");
  return { token: session.token, id: (await db.user.findUniqueOrThrow({ where: { emailKey: email } })).id };
}
const space = (owner: { token: string }, visibility = "PRIVATE") => createCommunity(db, owner.token, { name: "CE101 مجتمع", description: "", visibility });
const post = (owner: { token: string }, communityId: string, title = "منشور Feed") => createPost(db, owner.token, communityId, { requestId: randomUUID(), type: "QUESTION", title, body: "Original شرح <script>inert</script>" });
const feed = (reader: { token: string }, after?: string) => listFeed(db, reader.token, new URLSearchParams(after === undefined ? {} : { after }), key);
async function join(owner: { token: string }, reader: { token: string; id: string }, community: string, privateSpace = true) {
  await changeMembership(db, reader.token, community, { action: "join" });
  if (privateSpace) await changeMembership(db, owner.token, community, { action: "approve", userId: reader.id });
}
async function block(community: string) {
  const client = new Client({ connectionString: databaseUrl(manifest, name!, "migration") });
  await client.connect(); await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [community]); return client;
}
async function waiting(expected: number) {
  for (let i = 0; i < 100; i++) {
    await migration.query("SELECT pg_stat_clear_snapshot()");
    const rows = await migration.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
    if (rows.rows[0].count >= expected) return;
    await new Promise(done => setTimeout(done, 15));
  }
  throw new Error("Expected feed lock contention");
}
describe("M4-F01 feed on fresh PostgreSQL", () => {
  it("returns an empty feed to a verified profileless reader and denies missing, forged or logged-out sessions", async () => {
    const reader = await actor(false);
    expect((await feed(reader)).items).toEqual([]);
    expect((await feed(reader)).next).toBeNull();
    await expect(listFeed(db, undefined, new URLSearchParams(), key)).rejects.toMatchObject({ status: 401 });
    await expect(feed({ token: newToken() })).rejects.toMatchObject({ status: 401 });
    await logout(db, reader.token); await expect(feed(reader)).rejects.toMatchObject({ status: 401 });
  });
  it("includes only MEMBER public/private posts, excluding pending, rejected, removed, unrelated and owner-without-membership content", async () => {
    const owner = await actor(), reader = await actor(false);
    const pub = await space(owner, "PUBLIC"), priv = await space(owner), pending = await space(owner), rejected = await space(owner), unrelated = await space(owner, "PUBLIC");
    const yes = [await post(owner, pub.id), await post(owner, priv.id)];
    for (const community of [pending, rejected, unrelated]) await post(owner, community.id, "HIDDEN SENTINEL");
    await join(owner, reader, pub.id, false); await join(owner, reader, priv.id);
    for (const community of [pending, rejected]) await changeMembership(db, reader.token, community.id, { action: "join" });
    await changeMembership(db, owner.token, rejected.id, { action: "remove", userId: reader.id });
    const result = await feed(reader);
    expect(new Set(result.items.map(row => row.id))).toEqual(new Set(yes.map(row => row.id)));
    expect(result.items.every(row => row.communityName === "CE101 مجتمع")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/HIDDEN SENTINEL|authorId|email|submissionKey|ownerId/);
    await changeMembership(db, owner.token, priv.id, { action: "remove", userId: reader.id });
    expect((await feed(reader)).items.map(row => row.id)).toEqual([yes[0].id]);
    await migration.query('DELETE FROM "CommunityMembership" WHERE "communityId"=$1 AND "userId"=$2', [pub.id, owner.id]);
    expect((await feed(owner)).items.some(row => row.communityId === pub.id)).toBe(false);
  });
  it("orders across communities with tied timestamps, pages 20 without duplicates and rejects foreign-scope, stale and forged cursors", async () => {
    const owner = await actor(), reader = await actor(false), stranger = await actor(false);
    const spaces = [await space(owner, "PUBLIC"), await space(owner)];
    for (const community of spaces) await join(owner, reader, community.id, community !== spaces[0]);
    const ids = Array.from({ length: 23 }, () => randomUUID());
    for (let i = 0; i < ids.length; i++) await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'DISCUSSION\',\'Synthetic\',\'شرح\',$4)', [ids[i], spaces[i % 2].id, owner.id, i < 3 ? "2026-11-17T00:00:00Z" : "2024-01-01T00:00:00Z"]);
    const first = await feed(reader), second = await feed(reader, first.next!);
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    const ordered = [...ids.slice(0, 3).sort().reverse(), ...ids.slice(3).sort().reverse()];
    expect([...first.items, ...second.items].map(row => row.id)).toEqual(ordered);
    await join(owner, stranger, spaces[0].id, false); await join(owner, stranger, spaces[1].id);
    await expect(feed(stranger, first.next!)).rejects.toMatchObject({ status: 409 });
    const anchor = first.items.at(-1)!;
    const forged = feedCursor(anchor.id, anchor.createdAt, reader.id, "forged scope", key);
    await expect(feed(reader, forged)).rejects.toMatchObject({ status: 409 });
    await post(owner, spaces[0].id, "New post");
    expect((await feed(reader, first.next!)).items.map(row => row.id)).toEqual(second.items.map(row => row.id));
    await migration.query('UPDATE "Post" SET "createdAt"="createdAt"+interval \'1 second\' WHERE id=$1', [anchor.id]);
    await expect(feed(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    await expect(listFeed(db, reader.token, new URLSearchParams("after=bad&after=bad"), key)).rejects.toThrow("Invalid");
  });
  it("invalidates a cursor after membership changes, including public leave and private leave/rejoin", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner), pub = await space(owner, "PUBLIC");
    await join(owner, reader, community.id); await join(owner, reader, pub.id, false);
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT gen_random_uuid(),$1,$2,\'QUESTION\',\'Synthetic\',\'Body\' FROM generate_series(1,21)', [community.id, owner.id]);
    const first = await feed(reader);
    await changeMembership(db, reader.token, pub.id, { action: "leave" });
    await expect(feed(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    const next = await feed(reader);
    const originalMembership = await db.communityMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: community.id, userId: reader.id } } });
    await changeMembership(db, reader.token, community.id, { action: "leave" }); await join(owner, reader, community.id);
    // Reproduce a same-timestamp incarnation without waiting for clock precision.
    await migration.query('UPDATE "CommunityMembership" SET "createdAt"=$1 WHERE "communityId"=$2 AND "userId"=$3', [originalMembership.createdAt, community.id, reader.id]);
    await expect(feed(reader, next.next!)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects the entire page when membership removal wins an actual lock queue, including a revoked lookahead", async () => {
    const owner = await actor(), reader = await actor(false), spaces = [await space(owner), await space(owner)].sort((a, b) => a.id.localeCompare(b.id));
    for (const community of spaces) await join(owner, reader, community.id);
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT gen_random_uuid(),$1,$2,\'QUESTION\',\'Visible\',\'Body\' FROM generate_series(1,20)', [spaces[0].id, owner.id]);
    const hidden = await post(owner, spaces[1].id, "PRIVATE LOOKAHEAD");
    await migration.query('UPDATE "Post" SET "createdAt"=\'2024-01-01\' WHERE id=$1', [hidden.id]);
    const blocker = await block(spaces[1].id); let removal: Promise<unknown> | undefined, read: Promise<unknown> | undefined;
    try {
      removal = changeMembership(db, owner.token, spaces[1].id, { action: "remove", userId: reader.id }); await waiting(1);
      read = feed(reader).then(() => ({ status: 200 }), (error: { status: number }) => ({ status: error.status })); await waiting(2);
      await blocker.query("COMMIT"); await removal; expect(await read).toEqual({ status: 409 });
      expect((await feed(reader)).items).toHaveLength(20); expect((await feed(reader)).next).toBeNull();
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await Promise.allSettled([removal, read]); }
  });
  it("denies delivery when the session expires while waiting for a community lock", async () => {
    const owner = await actor(), community = await space(owner); await post(owner, community.id);
    const blocker = await block(community.id); let read: Promise<unknown> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'1 second\' WHERE "tokenDigest"=$1', [digest(owner.token)]);
      read = feed(owner).then(() => ({ status: 200 }), (error: { status: number }) => ({ status: error.status })); await waiting(1);
      for (;;) {
        if ((await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(owner.token)])).rows[0].expired) break;
        await new Promise(done => setTimeout(done, 20));
      }
      await blocker.query("COMMIT"); expect(await read).toEqual({ status: 401 });
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await read; }
  });
  it("reserves failed attempts durably without spending archive or content budgets", async () => {
    const reader = await actor(false);
    for (let i = 0; i < 30; i++) await feed(reader);
    await expect(feed(reader)).rejects.toMatchObject({ status: 429 });
    for (const prefix of ["m4-archive-search", "m3-post-write"]) expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`${prefix}:${reader.id}`) } })).toBeNull();
  });
});
