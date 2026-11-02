import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { digest, newToken } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost, listPosts, readPost } from "../../src/server/posts/service";
import { createComment, listComments } from "../../src/server/comments/service";
import { setVote } from "../../src/server/votes/service";
import { readPreferences, savePreferences } from "../../src/server/notifications/preferences";
import { listNotifications, notificationTarget } from "../../src/server/notifications/service";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M3_VOTES_UPGRADE_DATABASE;
for (const target of [name, upgrade]) if (!manifest.databases.some(record => record.name === target && record.kind === "test" && record.ready)) throw new Error("Owned disposable voting targets required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const options = { domains: ["university.test"], rateKey: randomBytes(32).toString("hex") }; let sequence = 0;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const email = `vote.${randomUUID()}@university.test`, browser = newToken(), ip = `203.0.113.${++sequence}`; let token = "";
  await requestSignIn(db, options, { email, browser, ip }, async message => { token = message.token; });
  const session = await confirmSignIn(db, options, { token, browser, ip });
  if (!session) throw new Error("Synthetic voting identity failed");
  if (profile) await updateOwnProfile(db, session.token, "Voting author");
  return { id: (await db.user.findUniqueOrThrow({ where: { emailKey: email } })).id, token: session.token };
}
const deny = (result: Promise<unknown>, status: number) => expect(result).rejects.toMatchObject({ status });
async function setup(visibility = "PUBLIC", profile = true) {
  const owner = await actor(), member = await actor(profile);
  const space = await createCommunity(db, owner.token, { name: "Voting space", description: "", visibility });
  await changeMembership(db, member.token, space.id, { action: "join" });
  if (visibility === "PRIVATE") await changeMembership(db, owner.token, space.id, { action: "approve", userId: member.id });
  const post = await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "QUESTION", title: "Vote target", body: "Body" });
  const comment = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Comment target" });
  const vote = (active: boolean, kind: "post" | "comment" = "post", token = member.token) => setVote(db, token, space.id, post.id, kind === "comment" ? comment.id : undefined, { value: active ? 1 : 0 });
  return { owner, member, space, post, comment, vote };
}
async function locker(id: string) {
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url }); await client.connect(); await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [id]); return client;
}
async function waiting(expected: number) {
  for (let i = 0; i < 150; i++) {
    await migration.query("SELECT pg_stat_clear_snapshot()");
    const row = await migration.query<{ count: string }>("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
    if (Number(row.rows[0].count) >= expected) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected real voting lock contention");
}

describe("voting on disposable PostgreSQL", () => {
  it("adds vote storage to populated comments without changing content, identities or memberships", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of readdirSync("prisma/migrations").filter(file => file < "20261027010000_m3_votes" && /^\d/.test(file)).sort()) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), community = randomUUID(), post = randomUUID(), comment = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [user, "vote-upgrade@university.test"]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Existing\',\'\',\'PRIVATE\')', [community, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [community, user]);
      await client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'QUESTION\',\'Existing\',\'Preserved\')', [post, community, user]);
      await client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) VALUES ($1,$2,$3,$4,\'تعليق Preserved\')', [comment, post, user, digest(newToken())]);
      const snapshot = async () => {
        const result = [];
        for (const table of ["User", "Community", "CommunityMembership", "Post", "Comment"]) result.push((await client.query(`SELECT * FROM "${table}"`)).rows);
        return JSON.stringify(result);
      };
      const before = await snapshot();
      await client.query(readFileSync("prisma/migrations/20261027010000_m3_votes/migration.sql", "utf8"));
      expect(await snapshot()).toBe(before);
      expect((await client.query('SELECT count(*) FROM "PostVote"')).rows[0].count).toBe("0");
      expect((await client.query('SELECT count(*) FROM "CommentVote"')).rows[0].count).toBe("0");
      for (const file of readdirSync("prisma/migrations").filter(file => file > "20261027010000_m3_votes" && file < "20261102000000_m3_signed_votes" && /^\d/.test(file)).sort()) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      await client.query('INSERT INTO "PostVote" ("postId","userId","createdAt") VALUES ($1,$2,\'2026-10-27T10:00Z\')', [post, user]);
      await client.query('INSERT INTO "CommentVote" ("commentId","userId","createdAt") VALUES ($1,$2,\'2026-10-27T10:00Z\')', [comment, user]);
      await client.query('INSERT INTO "NotificationPreference" ("userId",announcements,replies) VALUES ($1,false,false)', [user]);
      const populated = await snapshot();
      await client.query(readFileSync("prisma/migrations/20261102000000_m3_signed_votes/migration.sql", "utf8"));
      expect(await snapshot()).toBe(populated);
      for (const table of ["PostVote", "CommentVote"]) {
        const row = (await client.query(`SELECT value,"firstUpvotedAt"="createdAt" AS historical FROM "${table}"`)).rows[0];
        expect(row).toEqual({ value: 1, historical: true });
      }
      expect((await client.query('SELECT announcements,replies,upvotes FROM "NotificationPreference"')).rows[0]).toEqual({ announcements: false, replies: false, upvotes: true });
      expect((await client.query('SELECT count(*) FROM "Notification"')).rows[0].count).toBe("0");
    } finally { await client.end(); }
  });

  it("uses idempotent desired states on all post types and comments, including profileless members", async () => {
    const { owner, member, space } = await setup("PUBLIC", false);
    for (const type of ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"]) {
      await migration.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\' WHERE "keyDigest"=$1', [digest(`m3-vote-write:${member.id}`)]);
      const post = await createPost(db, owner.token, space.id, { requestId: randomUUID(), type, title: "Target", body: "Body" });
      const comment = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Target" });
      for (const id of [undefined, comment.id]) {
        const set = (active: boolean, token = member.token) => setVote(db, token, space.id, post.id, id, { value: active ? 1 : 0 });
        await deny(set(true, owner.token), 403); await deny(set(false, owner.token), 403);
        expect(await set(true)).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true });
        expect(await set(true)).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true });
        expect(await set(false)).toEqual({ score: 0, upvotes: 0, downvotes: 0, value: 0, canVote: true });
        expect(await set(false)).toEqual({ score: 0, upvotes: 0, downvotes: 0, value: 0, canVote: true });
      }
    }
  });

  it("serializes duplicate and opposite requests across sessions and keeps votes actor-scoped", async () => {
    const { member, space, post, comment, vote } = await setup(), other = await actor();
    await changeMembership(db, other.token, space.id, { action: "join" });
    const second = newToken();
    await migration.query('INSERT INTO "Session" (id,"userId","tokenDigest","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')', [randomUUID(), member.id, digest(second)]);
    for (const kind of ["post", "comment"] as const) {
      const results = await Promise.all([vote(true, kind), vote(true, kind, second)]);
      expect(results).toEqual([{ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true }, { score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true }]);
      expect(await vote(true, kind, other.token)).toEqual({ score: 2, upvotes: 2, downvotes: 0, value: 1, canVote: true });
      const block = await locker(space.id);
      let first: Promise<unknown> | undefined, last: Promise<unknown> | undefined;
      try {
        first = vote(false, kind); await waiting(1);
        last = vote(true, kind, second); await waiting(2);
        await block.query("COMMIT"); await first;
        expect(await last).toEqual({ score: 2, upvotes: 2, downvotes: 0, value: 1, canVote: true });
      } finally { await block.query("ROLLBACK"); await block.end(); await Promise.all([first, last]); }
    }
    expect((await readPost(db, member.token, space.id, post.id)).vote).toEqual({ score: 2, upvotes: 2, downvotes: 0, value: 1, canVote: true });
    expect((await listComments(db, member.token, space.id, post.id)).items.find(row => row.id === comment.id)?.vote).toEqual({ score: 2, upvotes: 2, downvotes: 0, value: 1, canVote: true });
  });

  it("counts each direction independently and excludes neutral markers on every target", async () => {
    const { owner, member, space, post, comment } = await setup(), opposite = await actor(), neutral = await actor();
    for (const voter of [opposite, neutral]) await changeMembership(db, voter.token, space.id, { action: "join" });
    const reply = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Separate totals", replyToId: comment.id });
    for (const id of [undefined, comment.id, reply.id]) {
      const set = (token: string, value: number) => setVote(db, token, space.id, post.id, id, { value });
      await set(member.token, 1); await set(opposite.token, -1); await set(neutral.token, 1);
      expect(await set(neutral.token, 0)).toEqual({ score: 0, upvotes: 1, downvotes: 1, value: 0, canVote: true });
      expect(await set(member.token, -1)).toEqual({ score: -2, upvotes: 0, downvotes: 2, value: -1, canVote: true });
      expect(await set(opposite.token, -1)).toEqual({ score: -2, upvotes: 0, downvotes: 2, value: -1, canVote: true });
      expect(await set(member.token, 0)).toEqual({ score: -1, upvotes: 0, downvotes: 1, value: 0, canVote: true });
      expect(await set(member.token, 1)).toEqual({ score: 0, upvotes: 1, downvotes: 1, value: 1, canVote: true });
    }
    expect((await readPost(db, member.token, space.id, post.id)).vote).toEqual({ score: 0, upvotes: 1, downvotes: 1, value: 1, canVote: true });
    const roots = await listComments(db, member.token, space.id, post.id), children = await listComments(db, member.token, space.id, post.id, undefined, comment.id);
    for (const row of [roots.items[0], children.items[0]]) expect(row.vote).toEqual({ score: 0, upvotes: 1, downvotes: 1, value: 1, canVote: true });
  });

  it("switches signed votes on posts, comments and replies without notifying on toggles", async () => {
    const { owner, member, space, post, comment } = await setup(), other = await actor();
    await changeMembership(db, other.token, space.id, { action: "join" });
    const reply = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Reply target", replyToId: comment.id });
    for (const id of [undefined, comment.id, reply.id]) {
      const set = (value: number, token = member.token) => setVote(db, token, space.id, post.id, id, { value });
      const where = { postId: post.id, commentId: id ?? null, kind: "UPVOTE" as const };
      expect(await set(-1)).toEqual({ score: -1, upvotes: 0, downvotes: 1, value: -1, canVote: true });
      expect(await db.notification.count({ where })).toBe(0);
      expect(await Promise.all([set(1), set(1)])).toEqual([{ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true }, { score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true }]);
      expect(await db.notification.count({ where })).toBe(1);
      expect(await set(-1)).toEqual({ score: -1, upvotes: 0, downvotes: 1, value: -1, canVote: true });
      expect(await set(0)).toEqual({ score: 0, upvotes: 0, downvotes: 0, value: 0, canVote: true });
      const row = id ? await db.commentVote.findUniqueOrThrow({ where: { commentId_userId: { commentId: id, userId: member.id } } }) : await db.postVote.findUniqueOrThrow({ where: { postId_userId: { postId: post.id, userId: member.id } } });
      expect(row.value).toBe(0); expect(row.firstUpvotedAt).not.toBeNull();
      await set(1); expect(await db.notification.count({ where })).toBe(1);
      expect(await set(-1, other.token)).toEqual({ score: 0, upvotes: 1, downvotes: 1, value: -1, canVote: true });
      const notification = await db.notification.findFirstOrThrow({ where });
      expect(notification.recipientId).toBe(owner.id);
      const target = await notificationTarget(db, owner.token, notification.id);
      expect(target).toMatchObject({ communityId: space.id, postId: post.id, commentId: id ?? null });
      await deny(notificationTarget(db, member.token, notification.id), 404);
    }
    const inbox = await listNotifications(db, owner.token);
    expect(inbox.items.filter(item => item.kind === "UPVOTE")).toHaveLength(3);
    expect(Object.keys(inbox.items[0]).sort()).toEqual(["createdAt", "id", "kind", "read", "title"]);
    const roots = await listComments(db, member.token, space.id, post.id);
    expect(roots.items.find(item => item.id === comment.id)?.replyCount).toBe(1);
  });

  it("respects independent upvote preferences and current membership without backfill", async () => {
    const { owner, member, space, post, comment } = await setup();
    expect(await readPreferences(db, owner.token)).toEqual({ announcements: true, replies: true, upvotes: true });
    await savePreferences(db, owner.token, { announcements: true, replies: true, upvotes: false });
    await savePreferences(db, owner.token, { announcements: false, replies: true });
    expect((await readPreferences(db, owner.token)).upvotes).toBe(false);
    await setVote(db, member.token, space.id, post.id, undefined, { value: 1 });
    expect(await db.notification.count({ where: { postId: post.id, kind: "UPVOTE" } })).toBe(0);
    await savePreferences(db, owner.token, { announcements: true, replies: true, upvotes: true });
    await setVote(db, member.token, space.id, post.id, undefined, { value: 0 });
    await setVote(db, member.token, space.id, post.id, undefined, { value: 1 });
    expect(await db.notification.count({ where: { postId: post.id, kind: "UPVOTE" } })).toBe(0);
    const target = await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Former member target" });
    await changeMembership(db, member.token, space.id, { action: "leave" });
    await setVote(db, owner.token, space.id, post.id, target.id, { value: 1 });
    await changeMembership(db, member.token, space.id, { action: "join" });
    await setVote(db, owner.token, space.id, post.id, target.id, { value: 0 });
    await setVote(db, owner.token, space.id, post.id, target.id, { value: 1 });
    expect(await db.notification.count({ where: { commentId: target.id, kind: "UPVOTE" } })).toBe(0);
    await setVote(db, member.token, space.id, post.id, comment.id, { value: 1 });
    expect(await db.notification.count({ where: { commentId: comment.id, kind: "UPVOTE" } })).toBe(1);
    const old = await db.notification.findFirstOrThrow({ where: { commentId: comment.id, kind: "UPVOTE" } });
    // Live access is rechecked for upvote notifications too, even in public spaces.
    const memberTarget = await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Visible before leave" });
    await setVote(db, owner.token, space.id, post.id, memberTarget.id, { value: 1 });
    const mine = await db.notification.findFirstOrThrow({ where: { commentId: memberTarget.id, kind: "UPVOTE" } });
    await changeMembership(db, member.token, space.id, { action: "leave" });
    await deny(notificationTarget(db, member.token, mine.id), 404);
    await deny(notificationTarget(db, member.token, old.id), 404);
  });

  it("rolls back the signed vote and first-event marker when notification delivery fails", async () => {
    const { member, space, post, comment } = await setup();
    await migration.query(`CREATE FUNCTION reject_test_upvote() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind::text='UPVOTE' AND NEW."postId"='${post.id}'::uuid THEN RAISE EXCEPTION 'Synthetic delivery failure'; END IF; RETURN NEW; END; $$`);
    await migration.query('CREATE TRIGGER reject_test_upvote BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION reject_test_upvote()');
    try {
      for (const id of [undefined, comment.id]) await expect(setVote(db, member.token, space.id, post.id, id, { value: 1 })).rejects.toThrow();
      expect(await db.postVote.count({ where: { postId: post.id } })).toBe(0);
      expect(await db.commentVote.count({ where: { commentId: comment.id } })).toBe(0);
      expect(await db.notification.count({ where: { postId: post.id, kind: "UPVOTE" } })).toBe(0);
    } finally {
      await migration.query('DROP TRIGGER reject_test_upvote ON "Notification"');
      await migration.query('DROP FUNCTION reject_test_upvote()');
    }
    await setVote(db, member.token, space.id, post.id, undefined, { value: 1 });
    expect(await db.notification.count({ where: { postId: post.id, kind: "UPVOTE" } })).toBe(1);
  });

  it("authorizes visibility, isolates every parent and exposes no voter identity in summaries", async () => {
    for (const visibility of ["PUBLIC", "PRIVATE"]) {
      const { owner, member, space, post, comment, vote } = await setup(visibility), stranger = await actor();
      for (const kind of ["post", "comment"] as const) {
        await deny(vote(true, kind, newToken()), 401);
        await deny(vote(true, kind, stranger.token), visibility === "PUBLIC" ? 403 : 404);
        await vote(true, kind);
      }
      const read = await readPost(db, owner.token, space.id, post.id);
      expect(read.vote).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 0, canVote: false });
      expect(Object.keys(read.vote).sort()).toEqual(["canVote", "downvotes", "score", "upvotes", "value"]);
      expect((await listPosts(db, member.token, space.id)).items.find(row => row.id === post.id)?.vote).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: true });
      await deny(setVote(db, member.token, space.id, randomUUID(), comment.id, { value: 1 }), 404);
      const other = await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "DISCUSSION", title: "Other", body: "Other" });
      await deny(setVote(db, member.token, space.id, other.id, comment.id, { value: 1 }), 404);
      await deny(setVote(db, member.token, randomUUID(), post.id, undefined, { value: 1 }), 404);
      await changeMembership(db, stranger.token, space.id, { action: "join" });
      if (visibility === "PRIVATE") await deny(vote(true, "comment", stranger.token), 404);
      await changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id });
      for (const kind of ["post", "comment"] as const) await deny(vote(false, kind), visibility === "PUBLIC" ? 403 : 404);
      if (visibility === "PRIVATE") {
        await deny(readPost(db, member.token, space.id, post.id), 404); await deny(listComments(db, member.token, space.id, post.id), 404);
      } else {
        expect((await readPost(db, member.token, space.id, post.id)).vote).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: false });
        expect((await listComments(db, member.token, space.id, post.id)).items[0].vote).toEqual({ score: 1, upvotes: 1, downvotes: 0, value: 1, canVote: false });
      }
    }
  });

  it.each(["post", "comment"] as const)("denies queued %s mutation after membership removal wins the lock", async kind => {
    const { owner, member, space, vote } = await setup("PRIVATE"); await vote(true, kind);
    const block = await locker(space.id); let removal: Promise<unknown> | undefined, pending: Promise<number> | undefined;
    try {
      removal = changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id }); await waiting(1);
      pending = vote(false, kind).then(() => 200, (error: { status: number }) => error.status); await waiting(2);
      await block.query("COMMIT"); await removal; expect(await pending).toBe(404);
    } finally { await block.query("ROLLBACK"); await block.end(); await Promise.all([removal, pending]); }
  });

  it("rolls back a vote when its session expires during the lock wait", async () => {
    const { member, space, post, vote } = await setup(), block = await locker(space.id);
    let pending: Promise<number> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(member.token)]);
      pending = vote(true).then(() => 200, (error: { status: number }) => error.status); await waiting(1);
      for (;;) {
        if ((await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(member.token)])).rows[0].expired) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await block.query("COMMIT"); expect(await pending).toBe(401);
      expect(await db.postVote.count({ where: { postId: post.id } })).toBe(0);
    } finally { await block.query("ROLLBACK"); await block.end(); await pending; }
  });

  it("reserves failed attempts separately from content budgets and resets its durable limit", async () => {
    const { owner, member, space, post, vote } = await setup();
    const key = digest(`m3-vote-write:${member.id}`);
    await migration.query('INSERT INTO "IdentityRateLimit" ("keyDigest",hits) VALUES ($1,29)', [key]);
    await deny(setVote(db, member.token, space.id, randomUUID(), undefined, { value: 1 }), 404);
    await deny(vote(true), 429);
    expect(await db.postVote.count({ where: { postId: post.id } })).toBe(0);
    await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Separate comment budget" });
    await createPost(db, member.token, space.id, { requestId: randomUUID(), type: "QUESTION", title: "Separate", body: "Budget" });
    await migration.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\' WHERE "keyDigest"=$1', [key]);
    await vote(true); expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(1);
    await deny(vote(true, "post", owner.token), 403);
  });

  it("enforces database uniqueness/foreign keys and denies runtime vote rewrites", async () => {
    const { member, post, comment, vote } = await setup(); await vote(true); await vote(true, "comment");
    for (const [table, field, target] of [["PostVote", "postId", post.id], ["CommentVote", "commentId", comment.id]]) {
      const insert = (id: string, user: string) => migration.query(`INSERT INTO "${table}" ("${field}","userId") VALUES ($1,$2)`, [id, user]);
      await expect(insert(target, member.id)).rejects.toMatchObject({ code: "23505" });
      await expect(insert(randomUUID(), member.id)).rejects.toMatchObject({ code: "23503" });
      await expect(insert(target, randomUUID())).rejects.toMatchObject({ code: "23503" });
      await expect(db.$executeRawUnsafe(`UPDATE "${table}" SET "userId"=$1`, member.id)).rejects.toThrow();
      await expect(db.$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow();
      await expect(migration.query(`UPDATE "${table}" SET value=2 WHERE "${field}"=$1`, [target])).rejects.toMatchObject({ code: "23514" });
      await expect(migration.query(`UPDATE "${table}" SET "firstUpvotedAt"=NULL WHERE "${field}"=$1`, [target])).rejects.toMatchObject({ code: "23514" });
    }
    await expect(migration.query('DELETE FROM "Comment" WHERE id=$1', [comment.id])).rejects.toMatchObject({ code: "23001" });
    const bare = randomUUID();
    await migration.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [bare, `vote-bare.${bare}@university.test`]);
    await migration.query('INSERT INTO "PostVote" ("postId","userId") VALUES ($1,$2)', [post.id, bare]);
    await expect(migration.query('DELETE FROM "User" WHERE id=$1', [bare])).rejects.toMatchObject({ code: "23001" });
  });
});
