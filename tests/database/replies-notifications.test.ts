import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { requestSignIn, confirmSignIn, updateOwnProfile } from "../../src/server/identity/service";
import { digest, newToken } from "../../src/server/identity/policy";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { createPost } from "../../src/server/posts/service";
import { createComment, listComments } from "../../src/server/comments/service";
import { readPreferences, savePreferences } from "../../src/server/notifications/preferences";
import { listNotifications, markAllNotificationsRead, notificationTarget } from "../../src/server/notifications/service";
import { setVote } from "../../src/server/votes/service";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";

const manifest = readManifest(), name = process.env.M1B_TEST_DATABASE, upgrade = process.env.M3_NOTIFICATIONS_UPGRADE_DATABASE;
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
  const vote = (active: boolean, kind: "post" | "comment" = "post", token = member.token) => setVote(db, token, space.id, post.id, kind === "comment" ? comment.id : undefined, { active });
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

describe("reply threads and atomic notification delivery", () => {
  it.each(["PUBLIC", "PRIVATE"])("hides %s notifications after removal and restores old read/unread state on rejoin without backfill", async visibility => {
    const { owner, member, space } = await setup(visibility);
    const announce = () => createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Notification target", body: "Body" });
    const first = await announce(), second = await announce();
    const before = await listNotifications(db, member.token);
    expect(before.unread).toBe(2); expect(before.items).toHaveLength(2);
    const read = await notificationTarget(db, member.token, before.items[0].id, true);
    expect(read.communityId).toBe(space.id); expect([first.id, second.id]).toContain(read.postId);
    const readAt = (await db.notification.findUniqueOrThrow({ where: { id: read.id } })).readAt;
    await notificationTarget(db, member.token, read.id, true);
    expect((await db.notification.findUniqueOrThrow({ where: { id: read.id } })).readAt).toEqual(readAt);
    await changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id });
    expect(await listNotifications(db, member.token)).toMatchObject({ items: [], unread: 0, next: null });
    await deny(notificationTarget(db, member.token, read.id), 404);
    await deny(notificationTarget(db, member.token, read.id, true), 404);
    await markAllNotificationsRead(db, member.token); // Hidden unread record stays unread.
    const missed = await announce(); expect(await db.notification.count({ where: { postId: missed.id } })).toBe(0);
    await changeMembership(db, member.token, space.id, { action: "join" });
    if (visibility === "PRIVATE") {
      expect((await listNotifications(db, member.token)).items).toEqual([]);
      await changeMembership(db, owner.token, space.id, { action: "approve", userId: member.id });
    }
    const restored = await listNotifications(db, member.token);
    expect(restored.items.map(row => row.id)).toEqual(before.items.map(row => row.id));
    expect(restored.unread).toBe(1); expect(restored.items.find(row => row.id === read.id)?.read).toBe(true);
    expect((await db.notification.findUniqueOrThrow({ where: { id: read.id } })).readAt).toEqual(readAt);
  });

  it("isolates notification owners, cursors and read actions; read-all excludes other users", async () => {
    const { owner, member, space, post } = await setup(), stranger = await actor();
    await changeMembership(db, stranger.token, space.id, { action: "join" });
    const announcement = await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Owned notification", body: "Body" });
    const mine = (await listNotifications(db, member.token)).items[0];
    expect(Object.keys(mine).sort()).toEqual(["createdAt", "id", "kind", "read", "title"]);
    await deny(notificationTarget(db, stranger.token, mine.id, true), 404);
    await deny(listNotifications(db, stranger.token, mine.id), 404);
    await deny(notificationTarget(db, newToken(), mine.id, true), 401);
    await deny(markAllNotificationsRead(db, newToken()), 401);
    await markAllNotificationsRead(db, member.token); await markAllNotificationsRead(db, member.token);
    expect((await listNotifications(db, member.token)).unread).toBe(0);
    expect((await listNotifications(db, stranger.token)).unread).toBe(1);
    expect(await db.notification.count({ where: { postId: announcement.id } })).toBe(2);
    expect(await db.notification.count({ where: { postId: post.id } })).toBe(0);
  });

  it("pages newest-first with tied timestamps and positions a linked long reply thread without reordering", async () => {
    const { owner, member, space, post, comment } = await setup();
    const ids = Array.from({ length: 23 }, () => randomUUID()).sort();
    await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId") SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Reply\',$4::uuid,$4::uuid FROM unnest($1::uuid[]) id', [ids, post.id, member.id, comment.id]);
    await migration.query('INSERT INTO "Notification" (id,"recipientId","postId","commentId","eventKey",kind) SELECT gen_random_uuid(),$2::uuid,$3::uuid,id,id,\'COMMENT\'::"NotificationKind" FROM unnest($1::uuid[]) id', [ids, owner.id, post.id]);
    const first = await listNotifications(db, owner.token), second = await listNotifications(db, owner.token, first.next);
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    expect([...first.items, ...second.items].map(row => row.id)).toEqual([...first.items, ...second.items].map(row => row.id).sort().reverse());
    expect(first.unread).toBe(23);
    const notification = await db.notification.findFirstOrThrow({ where: { commentId: ids[21] } });
    expect(await notificationTarget(db, owner.token, notification.id)).toMatchObject({ communityId: space.id, postId: post.id, rootId: comment.id, commentId: ids[21] });
    const context = await listComments(db, owner.token, space.id, post.id, undefined, comment.id, ids[21]);
    expect(context.items.map(row => row.id)).toEqual(ids.slice(21));
    await deny(listComments(db, owner.token, space.id, post.id, undefined, undefined, ids[21]), 404);
  });

  it.each(["list", "open", "all"])("rechecks membership after a queued %s operation loses the community lock race", async operation => {
    const { owner, member, space } = await setup("PRIVATE");
    await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Private target", body: "Body" });
    const notification = (await listNotifications(db, member.token)).items[0], block = await locker(space.id);
    let removal: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
    try {
      removal = changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id }); await waiting(1);
      const action = operation === "list" ? listNotifications(db, member.token) : operation === "open" ? notificationTarget(db, member.token, notification.id, true) : markAllNotificationsRead(db, member.token);
      pending = action.catch((error: { status: number }) => ({ status: error.status })); await waiting(2);
      await block.query("COMMIT"); await removal;
      const result = await pending;
      if (operation === "list") expect(result).toMatchObject({ items: [], unread: 0 });
      if (operation === "open") expect(result).toEqual({ status: 404 });
      expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt).toBeNull();
    } finally { await block.query("ROLLBACK"); await block.end(); await Promise.all([removal, pending]); }
  });

  it.each(["open", "all"])("rolls back %s read changes if the session expires while awaiting the community lock", async operation => {
    const { owner, member, space } = await setup();
    await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Target", body: "Body" });
    const id = (await listNotifications(db, member.token)).items[0].id, block = await locker(space.id);
    let pending: Promise<number> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(member.token)]);
      pending = (operation === "open" ? notificationTarget(db, member.token, id, true) : markAllNotificationsRead(db, member.token)).then(() => 200, (error: { status: number }) => error.status);
      await waiting(1);
      while (!(await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(member.token)])).rows[0].expired) await new Promise(resolve => setTimeout(resolve, 25));
      await block.query("COMMIT"); expect(await pending).toBe(401);
      expect((await db.notification.findUniqueOrThrow({ where: { id } })).readAt).toBeNull();
    } finally { await block.query("ROLLBACK"); await block.end(); await pending; }
  });
  it("paginates a flat reply thread oldest first with tied timestamps", async () => {
    const { owner, member, space, post, comment } = await setup();
    const ids = Array.from({ length: 23 }, () => randomUUID()).sort();
    await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId") SELECT id,$2::uuid,$3::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Reply\',$4::uuid,$4::uuid FROM unnest($1::uuid[]) id', [ids, post.id, owner.id, comment.id]);
    const first = await listComments(db, member.token, space.id, post.id, undefined, comment.id);
    expect(first.items).toHaveLength(20);
    const second = await listComments(db, member.token, space.id, post.id, first.next, comment.id);
    expect([...first.items, ...second.items].map(row => row.id)).toEqual(ids); expect(second.next).toBeNull();
  });

  it("rolls content back if notification insertion fails, and permits a subsequent safe retry", async () => {
    const { owner, member, space, post, comment } = await setup();
    // Test files run sequentially in this guarded disposable database. The
    // temporary failure trigger is always removed before another case runs.
    await migration.query("CREATE FUNCTION notification_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$");
    await migration.query('CREATE TRIGGER notification_test_failure BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_test_failure()');
    const data = { requestId: randomUUID(), body: "Atomic reply", replyToId: comment.id };
    try {
      await expect(createComment(db, member.token, space.id, post.id, data)).rejects.toThrow();
      expect(await db.comment.count({ where: { postId: post.id } })).toBe(1);
      expect(await db.notification.count({ where: { postId: post.id, recipientId: owner.id } })).toBe(0);
    } finally {
      await migration.query('DROP TRIGGER notification_test_failure ON "Notification"');
      await migration.query('DROP FUNCTION notification_test_failure()');
    }
    const saved = await createComment(db, member.token, space.id, post.id, data);
    expect(await db.notification.count({ where: { commentId: saved.id } })).toBe(1);
  });

  it("limits runtime writes to preference values and notification read state", async () => {
    const { member, space, owner } = await setup();
    await savePreferences(db, member.token, { announcements: false, replies: false });
    const runtime = new Client({ connectionString: databaseUrl(manifest, name!, "runtime") }); await runtime.connect();
    try {
      for (const sql of ['DELETE FROM "Notification"', 'DELETE FROM "NotificationPreference"', 'UPDATE "Notification" SET "recipientId"=gen_random_uuid()', 'UPDATE "NotificationPreference" SET "userId"=gen_random_uuid()']) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    await deny(savePreferences(db, newToken(), { announcements: true, replies: true }), 401);
    expect(await readPreferences(db, member.token)).toEqual({ announcements: false, replies: false });
    expect(await readPreferences(db, owner.token)).toEqual({ announcements: true, replies: true });
    await changeMembership(db, member.token, space.id, { action: "leave" });
  });
  it("upgrades populated voting data without changing existing identities, memberships, content or votes", async () => {
    const url = databaseUrl(manifest, upgrade!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      for (const file of readdirSync("prisma/migrations").filter(file => file < "20261028000000_m3_replies_notifications" && /^\d/.test(file)).sort()) await client.query(readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"));
      const user = randomUUID(), community = randomUUID(), post = randomUUID(), comment = randomUUID();
      await client.query('INSERT INTO "User" (id,email,"emailKey","updatedAt") VALUES ($1,$2,$2,now())', [user, "notification-upgrade@university.test"]);
      await client.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Existing\',\'\',\'PRIVATE\')', [community, user]);
      await client.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [community, user]);
      await client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'QUESTION\',\'Existing\',\'Preserved\')', [post, community, user]);
      await client.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body) VALUES ($1,$2,$3,$4,\'تعليق Preserved\')', [comment, post, user, digest(newToken())]);
      await client.query('INSERT INTO "PostVote" ("postId","userId") VALUES ($1,$2)', [post, user]);
      await client.query('INSERT INTO "CommentVote" ("commentId","userId") VALUES ($1,$2)', [comment, user]);
      const snapshot = async () => {
        const rows = [];
        for (const table of ["User", "Community", "CommunityMembership", "Post", "PostVote", "CommentVote"]) rows.push((await client.query(`SELECT * FROM "${table}"`)).rows);
        rows.push((await client.query('SELECT id,"postId","authorId","submissionKey",body,"createdAt" FROM "Comment"')).rows);
        return JSON.stringify(rows);
      };
      const before = await snapshot();
      await client.query(readFileSync("prisma/migrations/20261028000000_m3_replies_notifications/migration.sql", "utf8"));
      expect(await snapshot()).toBe(before);
      expect((await client.query('SELECT "rootId", "replyToId" FROM "Comment"')).rows).toEqual([{ rootId: null, replyToId: null }]);
      expect((await client.query('SELECT count(*) FROM "Notification"')).rows[0].count).toBe("0");
    } finally { await client.end(); }
  });

  it("keeps replies flat, names their direct addressee, preserves voting and deduplicates recipients", async () => {
    const { owner, member, space, post, comment } = await setup("PRIVATE");
    const third = await actor(); await changeMembership(db, third.token, space.id, { action: "join" });
    await changeMembership(db, owner.token, space.id, { action: "approve", userId: third.id });
    const first = await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Reply 1", replyToId: comment.id });
    expect(first.rootId).toBe(comment.id); expect(first.replyToId).toBe(comment.id); expect(first.replyToName).toBe("Voting author");
    expect(await db.notification.count({ where: { commentId: first.id } })).toBe(1);
    const second = await createComment(db, third.token, space.id, post.id, { requestId: randomUUID(), body: "Reply 2", replyToId: first.id });
    expect(second.rootId).toBe(comment.id); expect(second.replyToId).toBe(first.id);
    expect((await db.notification.findMany({ where: { commentId: second.id } })).map(row => row.recipientId).sort()).toEqual([owner.id, member.id].sort());
    expect((await listComments(db, member.token, space.id, post.id)).items.map(row => row.id)).toEqual([comment.id]);
    expect((await listComments(db, member.token, space.id, post.id, undefined, comment.id)).items.map(row => row.id)).toEqual([first.id, second.id]);
    expect(await setVote(db, owner.token, space.id, post.id, second.id, { active: true })).toEqual({ count: 1, active: true, canVote: true });
    await deny(setVote(db, third.token, space.id, post.id, second.id, { active: true }), 403);
  });

  it("rejects cross-post targets, forged roots, wrong-thread cursors and invalid SQL relationships", async () => {
    const { owner, member, space, post, comment } = await setup();
    const other = await createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "QUESTION", title: "Other", body: "Other" });
    const root2 = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Another root" });
    await deny(createComment(db, member.token, space.id, other.id, { requestId: randomUUID(), body: "Cross-post", replyToId: comment.id }), 404);
    const reply = await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Reply", replyToId: comment.id });
    await deny(listComments(db, member.token, space.id, post.id, reply.id, root2.id), 404);
    await deny(listComments(db, member.token, space.id, post.id, reply.id), 404);
    await deny(listComments(db, member.token, space.id, post.id, undefined, reply.id), 404);
    const insert = (root: string, target: string, parent = post.id) => migration.query('INSERT INTO "Comment" (id,"postId","submissionKey",body,"rootId","replyToId") VALUES ($1,$2,$3,\'Invalid\',$4,$5)', [randomUUID(), parent, digest(newToken()), root, target]);
    await expect(insert(root2.id, reply.id)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(reply.id, reply.id)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(comment.id, comment.id, other.id)).rejects.toMatchObject({ code: "23514" });
    await expect(migration.query('UPDATE "Comment" SET "rootId"=$1,"replyToId"=$1 WHERE id=$2', [root2.id, comment.id])).rejects.toMatchObject({ code: "23514" });
  });

  it("uses defaults and independent preferences, excluding pending, former members and the actor", async () => {
    const { owner, member, space, post, comment } = await setup("PRIVATE"), pending = await actor();
    await changeMembership(db, pending.token, space.id, { action: "join" });
    expect(await readPreferences(db, member.token)).toEqual({ announcements: true, replies: true });
    const announce = () => createPost(db, owner.token, space.id, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Announcement", body: "Body" });
    const first = await announce();
    expect((await db.notification.findMany({ where: { postId: first.id } })).map(row => row.recipientId)).toEqual([member.id]);
    await savePreferences(db, member.token, { announcements: false, replies: true });
    const second = await announce(); expect(await db.notification.count({ where: { postId: second.id } })).toBe(0);
    const root = await createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Member root" });
    await savePreferences(db, owner.token, { announcements: true, replies: false });
    const response = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Owner reply", replyToId: root.id });
    expect((await db.notification.findMany({ where: { commentId: response.id } })).map(row => row.recipientId)).toEqual([member.id]);
    const self = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Self reply", replyToId: comment.id });
    expect(await db.notification.count({ where: { commentId: self.id } })).toBe(0);
    await changeMembership(db, owner.token, space.id, { action: "remove", userId: member.id });
    const afterLeave = await createComment(db, owner.token, space.id, post.id, { requestId: randomUUID(), body: "Former member", replyToId: root.id });
    expect(await db.notification.count({ where: { commentId: afterLeave.id } })).toBe(0);
    expect(await db.notification.count({ where: { recipientId: member.id } })).toBe(2); // Records preserved.
  });

  it("deduplicates concurrent reply and announcement retries and conflicts on changed reply targets", async () => {
    const { owner, member, space, post, comment } = await setup();
    const extraSession = newToken();
    await migration.query('INSERT INTO "Session" (id,"userId","tokenDigest","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')', [randomUUID(), member.id, digest(extraSession)]);
    const data = { requestId: randomUUID(), body: "Retry", replyToId: comment.id };
    const results = await Promise.all([createComment(db, member.token, space.id, post.id, data), createComment(db, extraSession, space.id, post.id, data)]);
    expect(results[0]).toEqual(results[1]); expect(await db.notification.count({ where: { commentId: results[0].id } })).toBe(1);
    await deny(createComment(db, member.token, space.id, post.id, { ...data, replyToId: results[0].id }), 409);
    const announcement = { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Retry announcement", body: "Body" };
    const posts = await Promise.all([createPost(db, owner.token, space.id, announcement), createPost(db, owner.token, space.id, announcement)]);
    expect(posts[0]).toEqual(posts[1]); expect(await db.notification.count({ where: { postId: posts[0].id } })).toBe(1);
    await changeMembership(db, member.token, space.id, { action: "leave" });
    await deny(createComment(db, member.token, space.id, post.id, data), 403);
  });

  it("rolls back both reply and notifications when session expiry passes while waiting", async () => {
    const { owner, member, space, post, comment } = await setup(), block = await locker(space.id);
    let pending: Promise<number> | undefined;
    try {
      await migration.query('UPDATE "Session" SET "expiresAt"=clock_timestamp()+interval \'2 seconds\' WHERE "tokenDigest"=$1', [digest(member.token)]);
      pending = createComment(db, member.token, space.id, post.id, { requestId: randomUUID(), body: "Expired", replyToId: comment.id }).then(() => 200, (error: { status: number }) => error.status);
      await waiting(1);
      for (;;) {
        if ((await migration.query<{ expired: boolean }>('SELECT clock_timestamp()>"expiresAt" AS expired FROM "Session" WHERE "tokenDigest"=$1', [digest(member.token)])).rows[0].expired) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await block.query("COMMIT"); expect(await pending).toBe(401);
      expect(await db.comment.count({ where: { postId: post.id } })).toBe(1);
      expect(await db.notification.count({ where: { postId: post.id, recipientId: owner.id } })).toBe(0);
    } finally { await block.query("ROLLBACK"); await block.end(); await pending; }
  });
});

