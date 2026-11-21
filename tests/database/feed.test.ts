import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../src/generated/prisma/client";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile, logout } from "../../src/server/identity/service";
import { digest, newToken } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost } from "../../src/server/posts/service";
import { listFeed } from "../../src/server/feed/service";
import { feedCursor } from "../../src/server/feed/policy";
import { listForYou } from "../../src/server/feed/for-you-service";
import { setVote } from "../../src/server/votes/service";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M4_FEED_DATABASE;
if (!manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh guarded feed test target required");
const key = randomBytes(32).toString("hex"), options = { domains: ["university.test"], rateKey: key };
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client, sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url, connectionTimeoutMillis: 2000, statement_timeout: 3000, query_timeout: 4000 });
  await migration.connect();
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
const forYou = (reader: { token: string }, after?: string) => listForYou(db, reader.token, new URLSearchParams(after === undefined ? {} : { after }), key);
async function join(owner: { token: string }, reader: { token: string; id: string }, community: string, privateSpace = true) {
  await changeMembership(db, reader.token, community, { action: "join" });
  if (privateSpace) await changeMembership(db, owner.token, community, { action: "approve", userId: reader.id });
}
async function block(community: string) {
  const client = new Client({ connectionString: databaseUrl(manifest, name!, "migration"), connectionTimeoutMillis: 2000, statement_timeout: 2000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [community]);
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}
async function waitForCommunityQueue(blocker: Client, expectedModes: string[]) {
  const { rows: [{ pid }] } = await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const deadline = performance.now() + 1500;
  do {
    const { rows } = await migration.query<{ mode: string; pid: number }>(`
      SELECT waiting.mode, waiting.pid FROM pg_locks held JOIN pg_locks waiting
      USING (locktype, database, classid, objid, objsubid)
      WHERE held.pid = $1 AND held.locktype = 'advisory' AND held.granted
        AND NOT waiting.granted ORDER BY waiting.waitstart NULLS LAST`, [pid]);
    if (rows.length === expectedModes.length && rows.every((row, index) => row.mode === expectedModes[index])) return rows.map(row => row.pid);
    await new Promise(done => setTimeout(done, 15));
  } while (performance.now() < deadline);
  throw new Error(`Expected community lock queue: ${expectedModes.join(", ")}`);
}

async function waitForSessionLock(readerPid: number) {
  const deadline = performance.now() + 1500;
  do {
    const result = await migration.query<{ count: number }>(`
      SELECT count(DISTINCT l.pid)::int AS count FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE a.datname=current_database() AND l.locktype='transactionid' AND NOT l.granted
        AND $1::int=ANY(pg_blocking_pids(l.pid))`, [readerPid]);
    if (result.rows[0].count === 1) return;
    await new Promise(done => setTimeout(done, 15));
  } while (performance.now() < deadline);
  throw new Error("Expected logout to wait on the feed reader's session lock");
}

async function independentSession(userId: string) {
  const token = newToken();
  await migration.query(`INSERT INTO "Session" (id, "userId", "tokenDigest", "expiresAt")
    VALUES ($1, $2, $3, clock_timestamp() + interval '1 hour')`, [randomUUID(), userId, digest(token)]);
  return { token };
}

async function statusOf(promise: Promise<unknown>) {
  try { await promise; return 200; }
  catch (error) { return error instanceof Error && "status" in error ? error.status : undefined; }
}

type ExplainNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Loops": number;
  "Actual Rows": number;
  "Actual Total Time": number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Join Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Heap Fetches"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Local Hit Blocks"?: number;
  "Local Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  Plans?: ExplainNode[];
};
type Explain = { Plan: ExplainNode; "Planning Time": number; "Execution Time": number };

function summarizePlan(node: ExplainNode): object {
  // Use an allowlist: PostgreSQL may include bound values in filter expressions.
  return {
    node: node["Node Type"], relation: node["Relation Name"], index: node["Index Name"],
    loops: node["Actual Loops"], rowsPerLoop: node["Actual Rows"],
    filteredPerLoop: node["Rows Removed by Filter"] ?? 0,
    joinFilteredPerLoop: node["Rows Removed by Join Filter"] ?? 0,
    indexRecheckFilteredPerLoop: node["Rows Removed by Index Recheck"] ?? 0,
    heapFetches: node["Heap Fetches"], millisecondsPerLoop: node["Actual Total Time"],
    buffers: {
      sharedHit: node["Shared Hit Blocks"] ?? 0, sharedRead: node["Shared Read Blocks"] ?? 0,
      localHit: node["Local Hit Blocks"] ?? 0, localRead: node["Local Read Blocks"] ?? 0,
      tempRead: node["Temp Read Blocks"] ?? 0, tempWritten: node["Temp Written Blocks"] ?? 0,
    },
    children: node.Plans?.map(summarizePlan),
  };
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
    expect(await forYou(reader)).toMatchObject({ items: [], next: null, coldStart: true });
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

describe("M4-F02 For You on disposable PostgreSQL", () => {
  it("requires verified live sessions while preserving profileless cold-start public reads", async () => {
    const reader = await actor(false);
    const result = await forYou(reader);
    expect(result.coldStart).toBe(true);
    expect(result.items.every(row => row.reason === "public" && !row.vote.canVote)).toBe(true);
    await expect(listForYou(db, undefined, new URLSearchParams(), key)).rejects.toMatchObject({ status: 401 });
    await expect(forYou({ token: newToken() })).rejects.toMatchObject({ status: 401 });
    await migration.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [reader.id]);
    await expect(forYou(reader)).rejects.toMatchObject({ status: 401 });
    const expired = await actor(false);
    const expiredFixture = await migration.query<{ expired: boolean }>(`UPDATE "Session"
      SET "createdAt"=statement_timestamp()-interval '2 minutes', "expiresAt"=statement_timestamp()-interval '1 minute'
      WHERE "tokenDigest"=$1 RETURNING "createdAt" < "expiresAt" AND "expiresAt" < clock_timestamp() AS expired`, [digest(expired.token)]);
    expect(expiredFixture.rows).toEqual([{ expired: true }]);
    await expect(forYou(expired)).rejects.toMatchObject({ status: 401 });
    const loggedOut = await actor(false); await logout(db, loggedOut.token);
    await expect(forYou(loggedOut)).rejects.toMatchObject({ status: 401 });
  });
  it("includes disjoint MEMBER/public groups, all post types and own content; excludes every unauthorized private state", async () => {
    const owner = await actor(), reader = await actor(false);
    const joinedPublic = await space(owner, "PUBLIC"), joinedPrivate = await space(owner), publicDiscovery = await space(owner, "PUBLIC");
    await join(owner, reader, joinedPublic.id, false); await join(owner, reader, joinedPrivate.id);
    const permitted: string[] = [];
    for (const [index, type] of ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"].entries()) {
      const id = randomUUID(); permitted.push(id);
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"resourceUrl","createdAt") VALUES ($1,$2,$3,$4,\'CE101 شرح\',\'Original\',$5,\'2090-01-01\')',
        [id, index % 2 ? joinedPrivate.id : joinedPublic.id, index === 0 ? reader.id : owner.id, type, type === "RESOURCE" ? "https://example.com/reference" : null]);
    }
    const publicPost = await post(owner, publicDiscovery.id);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2090-01-02\' WHERE id=$1', [publicPost.id]);
    const hidden: string[] = [];
    for (const state of ["pending", "rejected", "removed", "unrelated", "owner"]) {
      const community = await space(owner), content = await post(owner, community.id, "FOR YOU PRIVATE SENTINEL"); hidden.push(content.id, community.id);
      // These rows would outrank every permitted row if privacy filtering failed.
      await migration.query('UPDATE "Post" SET "createdAt"=\'2090-02-01\' WHERE id=$1', [content.id]);
      if (state !== "unrelated" && state !== "owner") await changeMembership(db, reader.token, community.id, { action: "join" });
      if (state === "removed") await changeMembership(db, owner.token, community.id, { action: "approve", userId: reader.id });
      if (state === "removed" || state === "rejected") await changeMembership(db, owner.token, community.id, { action: "remove", userId: reader.id });
      if (state === "owner") {
        await migration.query('UPDATE "Community" SET "ownerId"=$1 WHERE id=$2', [reader.id, community.id]);
      }
      await expect(forYou(reader, `${content.id}.${"a".repeat(64)}`)).rejects.toMatchObject({ status: 404 });
    }
    const result = await forYou(reader);
    expect(result.coldStart).toBe(false);
    expect(result.items.slice(0, 4).map(row => row.id).sort()).toEqual(permitted.sort());
    expect(result.items.filter(row => permitted.includes(row.id)).every(row => row.reason === "joined")).toBe(true);
    expect(result.items.find(row => row.id === publicPost.id)).toMatchObject({ reason: "public", vote: { canVote: false } });
    const publicRows = await migration.query<{ id: string }>(`SELECT p.id FROM "Post" p
      JOIN "Community" c ON c.id=p."communityId" WHERE c.visibility='PUBLIC' AND c.id<>$1`, [joinedPublic.id]);
    const expectedIds = [...permitted, ...publicRows.rows.map(row => row.id)];
    let page = result;
    const returned: string[] = [];
    for (let index = 0; index < Math.ceil(expectedIds.length / 20); index++) {
      const serialized = JSON.stringify(page);
      for (const identifier of hidden) expect(serialized).not.toContain(identifier);
      expect(serialized).not.toMatch(/FOR YOU PRIVATE SENTINEL|authorId|ownerId|email|submissionKey|membership|rankTime/);
      returned.push(...page.items.map(row => row.id));
      if (returned.length === expectedIds.length) {
        expect(page.next).toBeNull(); // Hidden rows cannot create lookahead at the end.
      } else {
        expect(page.next?.split(".")[0]).toBe(page.items.at(-1)?.id);
        expect(page.next).not.toBeNull();
        page = await forYou(reader, page.next!);
      }
    }
    expect(returned.sort()).toEqual(expectedIds.sort());
  });
  it("traverses a frozen cross-group dataset completely with exact boost/ties and no duplicates or omissions", async () => {
    const owner = await actor(), reader = await actor(false), priv = await space(owner), pub = await space(owner, "PUBLIC");
    await join(owner, reader, priv.id);
    // Frozen 84-row evaluation: bilingual, all types, equal rank times across
    // groups, older joined content versus newer public content, and ms edges.
    for (let index = 0; index < 84; index++) {
      const member = index % 2 === 0, rank = Date.UTC(2091, 0, 10) - Math.floor(index / 4) * 86400000;
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,$4,$5,\'Frozen synthetic evaluation\',$6)',
        [`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, member ? priv.id : pub.id, owner.id,
          ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"][index % 4], index % 3 ? "CE101 pipeline" : "CE101 مؤشرات", new Date(rank - (member ? 259200000 : 0) + (index % 4 === 3 ? 1 : 0))]);
    }
    // Independent SQL oracle also accounts for public fixtures from F01.
    const expected = (await migration.query<{ id: string }>(`SELECT p.id FROM "Post" p JOIN "Community" c ON c.id=p."communityId"
      WHERE c.visibility='PUBLIC' OR EXISTS (SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=c.id AND m."userId"=$1 AND m.status='MEMBER')
      ORDER BY p."createdAt" + CASE WHEN EXISTS (SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=c.id AND m."userId"=$1 AND m.status='MEMBER')
        THEN interval '72 hours' ELSE interval '0 hours' END DESC, p.id DESC`, [reader.id])).rows.map(row => row.id);
    const actual: string[] = []; let cursor: string | undefined;
    do {
      const page = await forYou(reader, cursor); expect(page.items.length).toBeLessThanOrEqual(20);
      if (page.next) expect(page.items).toHaveLength(20);
      actual.push(...page.items.map(row => row.id)); cursor = page.next ?? undefined;
    } while (cursor);
    expect(actual).toEqual(expected); expect(new Set(actual).size).toBe(actual.length);
    expect(actual.filter(id => id.startsWith("00000000-0000-4000-8000-"))).toHaveLength(84);
  });
  it("rejects replay across users/feeds, tampering, missing anchors and changed/ineligible anchors", async () => {
    const owner = await actor(), reader = await actor(false), other = await actor(false), community = await space(owner);
    await join(owner, reader, community.id); await join(owner, other, community.id);
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") SELECT gen_random_uuid(),$1,$2,\'QUESTION\',\'Cursor fixture\',\'Body\',\'2092-01-01\' FROM generate_series(1,22)', [community.id, owner.id]);
    const first = await forYou(reader), f01 = await feed(reader);
    expect(first.next?.split(".")[0]).toBe(first.items[19].id);
    await expect(forYou(other, first.next!)).rejects.toMatchObject({ status: 409 });
    await expect(forYou(reader, f01.next!)).rejects.toMatchObject({ status: 409 });
    await expect(feed(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    const tampered = `${first.next!.slice(0, -1)}${first.next!.endsWith("0") ? "1" : "0"}`;
    await expect(forYou(reader, tampered)).rejects.toMatchObject({ status: 409 });
    await expect(forYou(reader, `${randomUUID()}.${"a".repeat(64)}`)).rejects.toMatchObject({ status: 404 });
    const anchor = first.items.at(-1)!;
    await migration.query('UPDATE "Post" SET "createdAt"="createdAt"+interval \'1 millisecond\' WHERE id=$1', [anchor.id]);
    await expect(forYou(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    const fresh = await forYou(reader);
    await changeMembership(db, reader.token, community.id, { action: "leave" });
    await expect(forYou(reader, fresh.next!)).rejects.toMatchObject({ status: 404 });
  });
  it("invalidates leave/rejoin in the same timestamp tick, including a still-public anchor", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner, "PUBLIC");
    await join(owner, reader, community.id, false);
    const before = await db.communityMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: community.id, userId: reader.id } } });
    const first = await forYou(reader); expect(first.next).not.toBeNull();
    await changeMembership(db, reader.token, community.id, { action: "leave" });
    await expect(forYou(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    await join(owner, reader, community.id, false);
    await migration.query('UPDATE "CommunityMembership" SET "createdAt"=$1 WHERE "communityId"=$2 AND "userId"=$3', [before.createdAt, community.id, reader.id]);
    await expect(forYou(reader, first.next!)).rejects.toMatchObject({ status: 409 });
    const privateCommunity = await space(owner); await join(owner, reader, privateCommunity.id);
    const privateBefore = await db.communityMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: privateCommunity.id, userId: reader.id } } });
    const privateCursor = (await forYou(reader)).next!;
    await changeMembership(db, reader.token, privateCommunity.id, { action: "leave" }); await join(owner, reader, privateCommunity.id);
    await migration.query('UPDATE "CommunityMembership" SET "createdAt"=$1 WHERE "communityId"=$2 AND "userId"=$3', [privateBefore.createdAt, privateCommunity.id, reader.id]);
    await expect(forYou(reader, privateCursor)).rejects.toMatchObject({ status: 409 });
  });
  it("locks the private community that supplies only lookahead and rejects the page if removal wins", async () => {
    const owner = await actor(), reader = await actor(false);
    const visibleCommunity = await space(owner), lookaheadCommunity = await space(owner);
    await join(owner, reader, visibleCommunity.id);
    await join(owner, reader, lookaheadCommunity.id);
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") SELECT gen_random_uuid(),$1,$2,\'QUESTION\',\'Visible\',\'Body\',\'2093-01-02\' FROM generate_series(1,20)', [visibleCommunity.id, owner.id]);
    const lookahead = await post(owner, lookaheadCommunity.id, "Private lookahead");
    const publicFallback = await post(owner, (await space(owner, "PUBLIC")).id);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2093-01-01\' WHERE id=$1', [lookahead.id]);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2093-01-01\' WHERE id=$1', [publicFallback.id]);
    const first = await forYou(reader);
    expect(first.items.map(row => row.communityId)).toEqual(Array(20).fill(visibleCommunity.id));
    expect(first.next).not.toBeNull();
    expect((await forYou(reader, first.next!)).items[0]?.id).toBe(lookahead.id);

    const blocker = await block(lookaheadCommunity.id);
    let removal: Promise<unknown> | undefined, read: Promise<unknown> | undefined;
    try {
      removal = statusOf(changeMembership(db, owner.token, lookaheadCommunity.id, { action: "remove", userId: reader.id }));
      await waitForCommunityQueue(blocker, ["ExclusiveLock"]);
      read = statusOf(forYou(reader));
      await waitForCommunityQueue(blocker, ["ExclusiveLock", "ShareLock"]);
      await blocker.query("COMMIT");
      expect(await removal).toBe(200);
      expect(await read).toBe(409);
      await expect(forYou(reader, first.next!)).rejects.toMatchObject({ status: 409 });
      const fresh = await forYou(reader);
      expect(fresh.items.map(row => row.id)).toEqual(first.items.map(row => row.id));
      expect(fresh.next).not.toBeNull();
      const following = await forYou(reader, fresh.next!);
      expect(following.items[0]?.id).toBe(publicFallback.id);
      expect(following.items.every(row => row.reason === "public")).toBe(true);
      expect(JSON.stringify(following)).not.toContain(lookahead.id);
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await Promise.allSettled([removal, read]); }
  });
  it("rejects a public-nonmember candidate promoted to MEMBER ahead of its read lock", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner, "PUBLIC"), content = await post(owner, community.id);
    const joinSession = await independentSession(reader.id);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2094-01-01\' WHERE id=$1', [content.id]);
    const blocker = await block(community.id); let joining: Promise<unknown> | undefined, read: Promise<unknown> | undefined;
    try {
      joining = statusOf(changeMembership(db, joinSession.token, community.id, { action: "join" }));
      await waitForCommunityQueue(blocker, ["ExclusiveLock"]);
      read = statusOf(forYou(reader));
      await waitForCommunityQueue(blocker, ["ExclusiveLock", "ShareLock"]);
      await blocker.query("COMMIT");
      expect(await joining).toBe(200);
      expect(await read).toBe(409);
      expect((await forYou(reader)).items.find(row => row.id === content.id)?.reason).toBe("joined");
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await Promise.allSettled([joining, read]); }
  });
  it("denies a read whose initially live session expires while it waits on a public candidate lock", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner, "PUBLIC"), content = await post(owner, community.id);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2095-01-01\' WHERE id=$1', [content.id]);
    const blocker = await block(community.id); let read: Promise<unknown> | undefined;
    async function sessionExpired() {
      const result = await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>="expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(reader.token)]);
      return result.rows[0].expired;
    }
    try {
      // Leave startup headroom while staying within the 3s candidate lock timeout.
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(reader.token)]);
      const deadline = performance.now() + 2750;
      read = statusOf(forYou(reader));
      await waitForCommunityQueue(blocker, ["ShareLock"]);
      expect(await sessionExpired()).toBe(false);
      while (performance.now() < deadline && !await sessionExpired()) {
        await new Promise(done => setTimeout(done, 20));
      }
      expect(await sessionExpired()).toBe(true);
      await blocker.query("COMMIT");
      expect(await read).toBe(401);
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await Promise.allSettled([read]); }
  });
  it("serializes live logout behind the read and persists revocation before a later read", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner, "PUBLIC");
    const content = await post(owner, community.id);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2095-02-01\' WHERE id=$1', [content.id]);
    const blocker = await block(community.id);
    let read: Promise<unknown> | undefined, exiting: Promise<boolean | null> | undefined;
    try {
      read = statusOf(forYou(reader));
      const [readerPid] = await waitForCommunityQueue(blocker, ["ShareLock"]);
      exiting = logout(db, reader.token).catch(() => null);
      await waitForSessionLock(readerPid);
      await blocker.query("COMMIT");
      expect(await read).toBe(200);
      expect(await exiting).toBe(true);
      const session = await migration.query<{ revoked: boolean }>(
        'SELECT "revokedAt" IS NOT NULL AND "expiresAt">clock_timestamp() AS revoked FROM "Session" WHERE "tokenDigest"=$1', [digest(reader.token)]);
      expect(session.rows).toEqual([{ revoked: true }]);
      await expect(forYou(reader)).rejects.toMatchObject({ status: 401 });
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); await Promise.allSettled([read, exiting]); }
  });
  it("batches vote information and preserves member, nonmember and self-vote permissions", async () => {
    const owner = await actor(), reader = await actor(false), joined = await space(owner), pub = await space(owner, "PUBLIC");
    await join(owner, reader, joined.id);
    const memberPost = await post(owner, joined.id), publicPost = await post(owner, pub.id);
    for (const id of [memberPost.id, publicPost.id]) await migration.query('UPDATE "Post" SET "createdAt"=\'2096-01-01\' WHERE id=$1', [id]);
    await setVote(db, reader.token, joined.id, memberPost.id, undefined, { value: 1 });
    const result = await forYou(reader);
    expect(result.items.find(row => row.id === memberPost.id)?.vote).toMatchObject({ upvotes: 1, score: 1, value: 1, canVote: true });
    expect(result.items.find(row => row.id === publicPost.id)?.vote.canVote).toBe(false);
    await expect(setVote(db, reader.token, pub.id, publicPost.id, undefined, { value: 1 })).rejects.toMatchObject({ status: 403 });
    expect((await forYou(owner)).items.find(row => row.id === memberPost.id)?.vote.canVote).toBe(false);
    await expect(setVote(db, owner.token, joined.id, memberPost.id, undefined, { value: 1 })).rejects.toMatchObject({ status: 403 });
  });
  it("has an independent durable 30-attempt budget, including failed signed-cursor reads", async () => {
    const reader = await actor(false);
    for (let index = 0; index < 30; index++) await expect(forYou(reader, `${randomUUID()}.${"a".repeat(64)}`)).rejects.toMatchObject({ status: 404 });
    await expect(forYou(reader)).rejects.toMatchObject({ status: 429 });
    expect((await feed(reader)).items).toEqual([]);
    for (const prefix of ["m4-archive-search", "m3-post-write"]) expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`${prefix}:${reader.id}`) } })).toBeNull();
  });
  it("measures first, deep and cold-start pages with bounded retrieval and candidate query plans", async () => {
    const owner = await actor(), reader = await actor(false), newcomer = await actor(false);
    for (let index = 0; index < 12; index++) {
      const community = await space(owner, index % 2 ? "PUBLIC" : "PRIVATE");
      if (index < 6) await join(owner, reader, community.id, index % 2 === 0);
      // Align rank times so both groups still compete at the measured deep page.
      const start = new Date(Date.UTC(2101, 0, index < 6 ? 1 : 4));
      await migration.query(`INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt")
        SELECT gen_random_uuid(),$1,$2,'DISCUSSION','CE101 performance','Synthetic plan fixture',
          $3::timestamptz-i*interval '1 second' FROM generate_series(1,100) i`, [community.id, owner.id, start]);
    }
    const url = databaseUrl(manifest, name!, "runtime"); await assertDatabaseIdentity(url, manifest, "runtime");
    const events: Prisma.QueryEvent[] = [];
    const instrumented = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: "event", level: "query" }] });
    instrumented.$on("query", event => events.push(event));
    const planner = new Client({ connectionString: url, connectionTimeoutMillis: 2000, statement_timeout: 3000, query_timeout: 4000 });
    try {
      await planner.connect();
      await listFeed(instrumented, reader.token, new URLSearchParams(), key);
      const f01Statements = events.length;
      async function measure(label: string, actor: { token: string }, pageNumber: number, after?: string) {
        events.length = 0;
        const started = performance.now();
        const page = await listForYou(instrumented, actor.token, new URLSearchParams(after ? { after } : {}), key);
        const milliseconds = performance.now() - started;
        expect(page.items).toHaveLength(20);
        expect(page.next).not.toBeNull();
        const bounded = events.filter(event => {
          if (!/FROM "public"\."Post"\s/.test(event.query)) return false;
          const parameter = /\bLIMIT\s+\$(\d+)\b/i.exec(event.query);
          if (!parameter) return false;
          // Prisma's query logger can serialize an integer limit as a string.
          const limit = (JSON.parse(event.params) as unknown[])[Number(parameter[1]) - 1];
          return limit === 21 || limit === "21";
        });
        // Prisma can skip an impossible member query for an empty membership set.
        if (page.coldStart) expect([2, 3]).toContain(bounded.length);
        else expect(bounded).toHaveLength(3);
        expect(events.filter(event => /FROM "public"\."PostVote"\s/.test(event.query))).toHaveLength(2);
        // A next page adds two anchor checks. Relation and vote reads stay batched.
        expect(events.length).toBeLessThanOrEqual(f01Statements + 1 + (after ? 2 : 0));
        const candidates = bounded.slice(0, -1);
        const plans = [];
        for (const [index, event] of candidates.entries()) {
          const result = await planner.query<{ "QUERY PLAN": Explain[] }>(
            "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + event.query, JSON.parse(event.params) as unknown[]);
          const plan = result.rows[0]["QUERY PLAN"][0];
          expect(plan.Plan["Actual Rows"]).toBeLessThanOrEqual(21);
          plans.push({ group: index === candidates.length - 1 ? "public" : "member",
            planningMilliseconds: plan["Planning Time"], executionMilliseconds: plan["Execution Time"],
            plan: summarizePlan(plan.Plan) });
        }
        return { page, sample: { label, pageNumber, milliseconds, statements: events.length, plans } };
      }

      const { page: first, sample: firstSample } = await measure("joined-first", reader, 1);
      const seen = new Set(first.items.map(row => row.id));
      let cursor = first.next!;
      const deepPageNumber = 12;
      for (let pageNumber = 2; pageNumber < deepPageNumber; pageNumber++) {
        events.length = 0;
        const page = await listForYou(instrumented, reader.token, new URLSearchParams({ after: cursor }), key);
        expect(page.items).toHaveLength(20);
        expect(page.next).not.toBeNull();
        for (const row of page.items) seen.add(row.id);
        cursor = page.next!;
      }
      const { page: deep, sample: deepSample } = await measure("joined-deep", reader, deepPageNumber, cursor);
      for (const row of deep.items) seen.add(row.id);
      expect(seen.size).toBe(20 * deepPageNumber);
      const { page: cold, sample: coldSample } = await measure("cold-start", newcomer, 1);
      expect(cold.coldStart).toBe(true);
      expect(cold.items.every(row => row.reason === "public")).toBe(true);
      console.log(JSON.stringify({ syntheticPostsAdded: 1200, communitiesAdded: 12, f01Statements,
        samples: [firstSample, deepSample, coldSample] }));
    } finally { await instrumented.$disconnect(); await planner.end(); }
  }, 45_000);
});
