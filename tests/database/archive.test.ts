import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { Prisma } from "../../src/generated/prisma/client";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile, logout } from "../../src/server/identity/service";
import { newToken, digest } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost } from "../../src/server/posts/service";
import { createComment } from "../../src/server/comments/service";
import { searchArchive, archiveCommentTarget, archiveCommunities, archiveCandidateQuery } from "../../src/server/archive/service";
import { archiveInput } from "../../src/server/archive/policy";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M4_ARCHIVE_DATABASE;
if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable archive target required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const key = randomBytes(32).toString("hex"), options = { domains: ["university.test"], rateKey: key }; let sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});

afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const email = `archive.${randomUUID()}@university.test`, browser = newToken(), ip = `198.51.100.${++sequence}`; let token = "";
  await requestSignIn(db, options, { email, browser, ip }, async message => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic archive actor failed");
  if (profile) await updateOwnProfile(db, session.token, "دارس Archive");
  return { id: (await db.user.findUniqueOrThrow({ where: { emailKey: email } })).id, token: session.token };
}
const query = (q: string, extra: Record<string, string> = {}) => archiveInput(new URLSearchParams({ q, ...extra }));
const search = (user: { token: string }, q: string, extra: Record<string, string> = {}) => searchArchive(db, user.token, query(q, extra), key);
const space = (owner: { token: string }, visibility = "PRIVATE") => createCommunity(db, owner.token, { name: `Archive ${randomUUID()}`, description: "", visibility });
const post = (owner: { token: string }, community: string, title: string, body = "Synthetic explanation", type = "DISCUSSION") => createPost(db, owner.token, community, { requestId: randomUUID(), type, title, body });
const deny = (promise: Promise<unknown>, status: number) => expect(promise).rejects.toMatchObject({ status });
async function approve(owner: { token: string }, user: { id: string; token: string }, community: string) {
  await changeMembership(db, user.token, community, { action: "join" });
  await changeMembership(db, owner.token, community, { action: "approve", userId: user.id });
}
async function waiting(expected: number) {
  for (let i = 0; i < 100; i++) {
    await migration.query("SELECT pg_stat_clear_snapshot()");
    const row = await migration.query<{ count: string }>("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
    if (Number(row.rows[0].count) >= expected) return;
    await new Promise(done => setTimeout(done, 15));
  }
  throw new Error("Expected archive lock contention");
}
async function locker(id: string) {
  const client = new Client({ connectionString: databaseUrl(manifest, name!, "migration") }); await client.connect();
  await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [id]); return client;
}

describe("permission-aware bilingual archive on disposable PostgreSQL", () => {
  it("matches title/body or one comment, deduplicates parents, normalizes Arabic and preserves cross-year context", async () => {
    const owner = await actor(), community = await space(owner), scope = { community: community.id };
    const old = await post(owner, community.id, "Pipeline architecture", "hazards explanation");
    await migration.query('UPDATE "Post" SET "createdAt"=$1 WHERE id=$2', ["2024-03-10T12:00:00Z", old.id]);
    const current = await post(owner, community.id, "تَـطْبِيع قَوَاعِد البَيَانَات CE101", "مؤشرات ".repeat(80));
    const root = await createComment(db, owner.token, community.id, current.id, { requestId: randomUUID(), body: "pipeline hazards first answer" });
    await createComment(db, owner.token, community.id, current.id, { requestId: randomUUID(), body: "pipeline hazards duplicate" });
    const split = await post(owner, community.id, "Unrelated words");
    await createComment(db, owner.token, community.id, split.id, { requestId: randomUUID(), body: "pipeline" });
    await createComment(db, owner.token, community.id, split.id, { requestId: randomUUID(), body: "hazards" });
    const result = await search(owner, "PIPELINE hazards", scope);
    expect(result.items.map(item => item.id)).toEqual([current.id, old.id]);
    expect(result.items[0].commentId).toBe(root.id); expect(result.items[1].createdAt.getUTCFullYear()).toBe(2024);
    expect((await search(owner, "تطبيع قواعد البيانات", scope)).items.map(item => item.id)).toEqual([current.id]);
    const mixed = await search(owner, "ce101 مُـؤَشِّرَات", scope);
    expect(mixed.items[0].id).toBe(current.id); expect(Array.from(mixed.items[0].excerpt).length).toBe(240);
    expect((await db.post.findUniqueOrThrow({ where: { id: current.id } })).title).toContain("تَـطْبِيع");
    expect((await archiveCommentTarget(db, owner.token, community.id, current.id, root.id)).rootId).toBe(root.id);
    await deny(archiveCommentTarget(db, owner.token, community.id, old.id, root.id), 404);
  });
  it("keeps public reads available to profileless nonmembers and hides private titles, snippets and targets until approval and after revocation", async () => {
    const owner = await actor(), reader = await actor(false), publicSpace = await space(owner, "PUBLIC"), privateSpace = await space(owner);
    const marker = `visibility${randomUUID()}`;
    const publicPost = await post(owner, publicSpace.id, marker), privatePost = await post(owner, privateSpace.id, marker, "Private excerpt");
    const comment = await createComment(db, owner.token, privateSpace.id, privatePost.id, { requestId: randomUUID(), body: marker });
    expect((await search(reader, marker)).items.map(item => item.id)).toEqual([publicPost.id]);
    await deny(search(reader, marker, { community: privateSpace.id }), 404);
    await deny(search(reader, marker, { community: randomUUID() }), 404);
    await changeMembership(db, reader.token, privateSpace.id, { action: "join" });
    expect((await search(reader, marker)).items.map(item => item.id)).toEqual([publicPost.id]);
    await changeMembership(db, owner.token, privateSpace.id, { action: "approve", userId: reader.id });
    expect((await search(reader, marker)).items).toHaveLength(2);
    await changeMembership(db, owner.token, privateSpace.id, { action: "remove", userId: reader.id });
    const result = await search(reader, marker);
    expect(JSON.stringify(result)).not.toContain(privatePost.id); expect(JSON.stringify(result)).not.toContain("Private excerpt");
    await deny(archiveCommentTarget(db, reader.token, privateSpace.id, privatePost.id, comment.id), 404);
    await deny(searchArchive(db, undefined, query(marker), key), 401);
    await logout(db, reader.token); await deny(search(reader, marker), 401);
  });
  it("paginates tied times and binds cursors to actor/query/type/community and current anchor access", async () => {
    const owner = await actor(), reader = await actor(), community = await space(owner), marker = `page${randomUUID()}`;
    await approve(owner, reader, community.id);
    const ids = Array.from({ length: 23 }, () => randomUUID());
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',$4,\'Text\' FROM unnest($1::uuid[]) id', [ids, community.id, owner.id, marker]);
    const first = await search(reader, marker, { community: community.id, type: "QUESTION" });
    const second = await search(reader, marker, { community: community.id, type: "QUESTION", after: first.next! });
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(23);
    expect((await search(reader, marker, { type: "RESOURCE" })).items).toEqual([]);
    await expect(search(reader, marker, { community: community.id, after: first.next! })).rejects.toThrow("Restart archive");
    await expect(search(owner, marker, { community: community.id, type: "QUESTION", after: first.next! })).rejects.toThrow("Restart archive");
    await changeMembership(db, reader.token, community.id, { action: "leave" });
    await deny(search(reader, marker, { community: community.id, type: "QUESTION", after: first.next! }), 404);
  });
  it("uses literal punctuation and fresh text, preserves deleted-author fallback and never exposes whole bodies", async () => {
    const owner = await actor(), community = await space(owner), scope = { community: community.id };
    const first = await post(owner, community.id, "Literals", "50% foo_bar \\path select' C++ " + "😀".repeat(300));
    await post(owner, community.id, "Near miss", "500 fooXbar path select C");
    expect((await search(owner, "50% foo_bar", scope)).items.map(item => item.id)).toEqual([first.id]);
    expect((await search(owner, "\\path select' C++", scope)).items).toHaveLength(1);
    expect((await search(owner, "select' OR 1=1", scope)).items).toEqual([]);
    await migration.query('UPDATE "Post" SET "authorId"=NULL, body=\'changed content\' WHERE id=$1', [first.id]);
    expect((await search(owner, "50%", scope)).items).toEqual([]);
    expect((await search(owner, "changed", scope)).items[0].authorName).toBeNull();
  });
  it("reserves failed search attempts durably under a separate 30/15-minute budget", async () => {
    const user = await actor(false), unknown = randomUUID();
    for (let i = 0; i < 30; i++) await deny(search(user, "budget", { community: unknown }), 404);
    await deny(search(user, "budget"), 429);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`m3-community-write:${user.id}`) } })).toBeNull();
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\' WHERE "keyDigest"=$1', [digest(`m4-archive-search:${user.id}`)]);
    expect((await search(user, "budget")).items).toEqual([]);
  });
  it("omits private content when membership removal wins the real multi-community search lock queue", async () => {
    const owner = await actor(), reader = await actor(), community = await space(owner), marker = `race${randomUUID()}`;
    await approve(owner, reader, community.id); await post(owner, community.id, marker);
    const block = await locker(community.id); let removal: Promise<unknown> | undefined, pending: ReturnType<typeof search> | undefined;
    try {
      removal = changeMembership(db, owner.token, community.id, { action: "remove", userId: reader.id }); await waiting(1);
      pending = search(reader, marker); await waiting(2); await block.query("COMMIT"); await removal;
      expect(await pending).toEqual({ items: [], next: null, interrupted: true });
    } finally { await block.query("ROLLBACK"); await block.end(); await Promise.all([removal, pending]); }
  });
  it("rejects a session expiring while the real search lock is awaited", async () => {
    const owner = await actor(), community = await space(owner), marker = `expiry${randomUUID()}`;
    await post(owner, community.id, marker); const block = await locker(community.id);
    let pending: Promise<unknown> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'1.5 seconds\' WHERE "tokenDigest"=$1', [digest(owner.token)]);
      pending = search(owner, marker).then(() => ({ status: 200 }), (error: { status?: number }) => ({ status: error.status })); await waiting(1);
      for (;;) {
        const row = await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(owner.token)]);
        if (row.rows[0].expired) break; await new Promise(done => setTimeout(done, 20));
      }
      await block.query("COMMIT"); expect(await pending).toEqual({ status: 401 });
    } finally { await block.query("ROLLBACK"); await block.end(); await pending; }
  });
  it("bounds community choices while supporting an accessible selected community outside the first page", async () => {
    const owner = await actor(), reader = await actor(false), ids = Array.from({ length: 55 }, () => randomUUID());
    const hidden = await space(owner);
    await migration.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) SELECT id,$2::uuid,\'ZZZ archive option\',\'\',\'PUBLIC\' FROM unnest($1::uuid[]) id', [ids, owner.id]);
    const options = await archiveCommunities(db, reader.token);
    expect(options.items).toHaveLength(50); expect(options.more).toBe(true);
    const selected = ids.find(id => !options.items.some(item => item.id === id))!;
    expect((await archiveCommunities(db, reader.token, selected)).items.some(item => item.id === selected)).toBe(true);
    await deny(archiveCommunities(db, reader.token, hidden.id), 404);
  });
  it("records lexical differences and actual bounded candidate plans on a 10,000-post synthetic corpus", async () => {
    const user = await actor(), community = await space(user), marker = `measure${randomUUID()}`;
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") SELECT gen_random_uuid(),$1::uuid,$2::uuid,\'DISCUSSION\',$3,CASE WHEN n%100=0 THEN \'مُـؤَشِّرَات pipeline hazards C++\' ELSE \'ordinary synthetic explanation\' END, now()-n*interval \'1 second\' FROM generate_series(1,10000) n', [community.id, user.id, marker]);
    const measurements = [];
    for (const term of [marker, "مؤشرات", "missing"] ) {
      const input = query(term, { community: community.id }), started = performance.now();
      const result = await searchArchive(db, user.token, input, key), elapsedMs = Math.round(performance.now() - started);
      const statement = archiveCandidateQuery(input, user.id);
      const [plan] = await db.$queryRaw<{ "QUERY PLAN": { "Execution Time": number; Plan: { "Node Type": string; "Actual Rows": number } }[] }[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`);
      const details = plan["QUERY PLAN"][0];
      measurements.push({ archiveSyntheticCorpus: 10000, category: term === marker ? "broad" : term === "missing" ? "no-match" : "arabic-selective", elapsedMs, returned: result.items.length, planMs: details["Execution Time"], topNode: details.Plan["Node Type"], actualRows: details.Plan["Actual Rows"] });
    }
    const samples = await migration.query<{ literal: boolean; lexical: boolean }>("SELECT strpos('pipeline','pipe')>0 AS literal, to_tsvector('simple','pipeline') @@ plainto_tsquery('simple','pipe') AS lexical UNION ALL SELECT strpos('C','C++')>0, to_tsvector('simple','C') @@ plainto_tsquery('simple','C++')");
    expect(samples.rows).toEqual([{ literal: true, lexical: false }, { literal: false, lexical: true }]);
    writeFileSync(".cache/m4-search-measurements.json", JSON.stringify({ measurements, lexicalComparison: samples.rows }, null, 2));
  });
});

describe("archive access and pagination edge cases", () => {
  it("retains private creator post access without granting private comment access", async () => {
    const owner = await actor(), community = await space(owner), marker = `creator${randomUUID()}`;
    const own = await post(owner, community.id, marker), other = await post(owner, community.id, "Unrelated parent");
    const comment = await createComment(db, owner.token, community.id, other.id, { requestId: randomUUID(), body: marker });
    // Fixture-only state; current APIs prevent an owner from leaving.
    await migration.query('DELETE FROM "CommunityMembership" WHERE "communityId"=$1 AND "userId"=$2', [community.id, owner.id]);
    const result = await search(owner, marker, { community: community.id });
    expect(result.items.map(item => item.id)).toEqual([own.id]);
    expect(result.items[0].commentId).toBeNull();
    await deny(archiveCommentTarget(db, owner.token, community.id, other.id, comment.id), 404);
  });
  it("locks two candidate communities in sorted order and reauthorizes a revoked lookahead", async () => {
    const owner = await actor(), reader = await actor(false), marker = `ordered${randomUUID()}`;
    const spaces = [await space(owner), await space(owner)].sort((a, b) => a.id.localeCompare(b.id));
    for (const community of spaces) await approve(owner, reader, community.id);
    const visible = await post(owner, spaces[0].id, marker);
    // Twenty newest parents are in the first lock; the private lookahead is in
    // the second lock, so its revocation must also invalidate the next cursor.
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") SELECT gen_random_uuid(),$1::uuid,$2::uuid,\'DISCUSSION\',$3,\'Synthetic\',clock_timestamp() FROM generate_series(1,19)', [spaces[0].id, owner.id, marker]);
    const hidden = await post(owner, spaces[1].id, marker);
    await migration.query('UPDATE "Post" SET "createdAt"=\'2024-01-01T00:00:00Z\' WHERE id=$1', [hidden.id]);
    const block = await locker(spaces[1].id);
    let removal: Promise<unknown> | undefined, pending: ReturnType<typeof search> | undefined;
    try {
      removal = changeMembership(db, owner.token, spaces[1].id, { action: "remove", userId: reader.id }); await waiting(1);
      pending = search(reader, marker); await waiting(2);
      const grants = await migration.query<{ granted: boolean }>(`SELECT l.granted FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE a.datname=current_database() AND l.locktype='advisory' AND l.mode='ShareLock'
        AND l.classid=((hashtextextended($1::text,0)>>32)&4294967295)::oid
        AND l.objid=(hashtextextended($1::text,0)&4294967295)::oid`, [spaces[0].id]);
      expect(grants.rows.some(row => row.granted)).toBe(true);
      await block.query("COMMIT"); await removal;
      const result = await pending;
      expect(result.items).toHaveLength(20); expect(result.items.some(item => item.id === visible.id)).toBe(true);
      expect(result.items.some(item => item.id === hidden.id)).toBe(false);
      expect(result.next).toBeNull(); expect(result.interrupted).toBe(true);
    } finally { await block.query("ROLLBACK"); await block.end(); await Promise.allSettled([removal, pending].filter(Boolean)); }
  });
  it("rejects a no-longer-matching anchor and does not shift old pages after a new insert", async () => {
    const owner = await actor(), community = await space(owner), marker = `stable${randomUUID()}`, ids = Array.from({ length: 23 }, () => randomUUID());
    await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',$4,\'Synthetic\' FROM unnest($1::uuid[]) id', [ids, community.id, owner.id, marker]);
    const first = await search(owner, marker, { community: community.id }), inserted = await post(owner, community.id, marker);
    const second = await search(owner, marker, { community: community.id, after: first.next! });
    const combined = [...first.items, ...second.items].map(item => item.id);
    expect(combined).toHaveLength(23); expect(new Set(combined).size).toBe(23); expect(combined).not.toContain(inserted.id);
    const anchor = first.items.at(-1)!;
    await migration.query('UPDATE "Post" SET title=\'Changed fixture\',body=\'No longer matches\' WHERE id=$1', [anchor.id]);
    await deny(search(owner, marker, { community: community.id, after: first.next! }), 404);
  });
});
