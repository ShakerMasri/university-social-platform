import { createHash } from "node:crypto";
import { Client } from "pg";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../database/targets.ts";
import { eligibleEmail, syntheticDomain } from "../../src/server/identity/policy.ts";
import { validateDisplayName } from "../../src/server/database/validation.ts";

export type ManualFixtureTarget = {
  sessionId: string;
  databaseName: string;
  databaseMarker: string;
  entryDatabaseNames: string[];
};

// This additional marker is written by the supervisor ONLY after createDatabase
// succeeds. A normal retained test database's project marker is not sufficient.
export async function manualDatabase(target: ManualFixtureTarget) {
  const manifest = readManifest();
  if (!/^[a-f0-9]{12}$/.test(target.sessionId) || !/^mqa_[a-f0-9]{32}$/.test(target.databaseMarker) ||
      target.databaseName !== `usp_m1b_${manifest.owner}_test_${target.sessionId}` ||
      target.entryDatabaseNames.includes(target.databaseName) ||
      !manifest.databases.some(row => row.name === target.databaseName && row.kind === "test" && row.ready)) {
    throw new Error("An exclusively owned new manual QA target is required");
  }
  const url = databaseUrl(manifest, target.databaseName, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  try {
    await client.connect();
    const result = await client.query<{ marker: string }>(
      "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    );
    if (result.rows.length !== 1 || result.rows[0].marker !== target.databaseMarker) throw new Error("Manual marker mismatch");
    return client;
  } catch {
    await client.end();
    throw new Error("Manual database identity/creation marker verification failed; no target adopted");
  }
}

export async function seedManualFixtures(target: ManualFixtureTarget) {
  const client = await manualDatabase(target);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  function id(label: string) {
    const bytes = createHash("sha256").update(`manual:${target.sessionId}:${label}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const aliases = ["A", "B", "C", "D", "E", "F", ...Array.from({ length: 15 }, (_, i) => `extra${String(i + 1).padStart(2, "0")}`), "unconfirmed"];
  const names: Record<string, string> = {
    A: "Alice M4QA", B: "باسم M4QA", C: "Casey CE101 M4QA", D: "دانا M4QA",
    E: "Shared M4QA مشترك", F: "Shared M4QA مشترك", unconfirmed: "Unconfirmed M4QA",
  };
  const accounts = aliases.map(alias => ({
    alias, userId: id(`user:${alias}`), directoryId: id(`directory:${alias}`),
    ...eligibleEmail(`qa.${target.sessionId}.${alias.toLowerCase()}@${syntheticDomain}`, [syntheticDomain]),
    displayName: validateDisplayName(names[alias] ?? `Extra ${alias.slice(5)} M4QA`),
    verified: alias !== "unconfirmed",
  }));
  const actor = (alias: string) => accounts.find(row => row.alias === alias)!;
  const publicCommunity = id("community:public"), privateCommunity = id("community:private");
  const publicPosts: { id: string; type: string; title: string; createdAt: string }[] = [];
  const archiveRows: { id: string; createdAt: string; private: boolean }[] = [];
  const privatePosts: string[] = [];
  const conversations: { scenario: string; id: string; initiator: string; recipient: string; state: string; blocked: boolean; count: number; messageIds: string[] }[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`manual-fixtures:${target.sessionId}`]);
    // Refuse re-seeding or adopting populated data, even if a caller repeats setup.
    const populated = await client.query<{ populated: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM "User") OR EXISTS(SELECT 1 FROM "Profile") OR
      EXISTS(SELECT 1 FROM "Community") OR EXISTS(SELECT 1 FROM "Post") OR
      EXISTS(SELECT 1 FROM "DirectConversation") AS populated`);
    if (populated.rows[0].populated) throw new Error("Manual target is not empty");
    for (const account of accounts) {
      await client.query(`INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt")
        VALUES ($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END,now())`,
      [account.userId, account.email, account.emailKey, account.verified]);
      await client.query(`INSERT INTO "Profile" ("userId","directoryId","displayName","updatedAt") VALUES ($1,$2,$3,now())`,
        [account.userId, account.directoryId, account.displayName]);
    }
    for (const [community, owner, visibility] of [[publicCommunity, "A", "PUBLIC"], [privateCommunity, "B", "PRIVATE"]] as const) {
      await client.query(`INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,$3,$4,$5::"CommunityVisibility")`,
        [community, actor(owner).userId, `M4QA ${visibility} مجتمع`, "Fictional manual QA study community", visibility]);
    }
    for (const [community, alias, status] of [
      [publicCommunity, "A", "MEMBER"], [publicCommunity, "B", "MEMBER"], [publicCommunity, "C", "MEMBER"],
      [privateCommunity, "B", "MEMBER"], [privateCommunity, "A", "MEMBER"], [privateCommunity, "E", "PENDING"],
    ]) {
      await client.query(`INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,$3::"MembershipStatus")`,
        [community, actor(alias).userId, status]);
    }
    const types = ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"];
    for (let index = 0; index < 27; index++) {
      const isPrivate = index >= 24, type = types[index % types.length], postId = id(`post:${index}`);
      const topic = isPrivate ? "PrivateOnly محتوى خاص" : index < 8 ? "pipeline hazards" : index < 16 ? "تطبيع قواعد البيانات" : "CE101 مؤشرات";
      const title = `M4QA ${String(index + 1).padStart(2, "0")} ${topic}`;
      const createdAt = new Date(Date.UTC(index % 2 ? 2026 : 2024, 0, 1, 0, index)).toISOString();
      await client.query(`INSERT INTO "Post" (id,"communityId","authorId","submissionKey",type,title,body,"resourceUrl","createdAt")
        VALUES ($1,$2,$3,$4,$5::"PostType",$6,$7,$8,$9)`, [postId, isPrivate ? privateCommunity : publicCommunity,
        actor(isPrivate ? "B" : "A").userId, hash(`post:${target.sessionId}:${index}`), type, title,
        `Fictional study example only. مثال دراسي اصطناعي ${topic}`,
        type === "RESOURCE" ? `https://example.com/m4-qa/${index}` : null, createdAt]);
      if (isPrivate) privatePosts.push(postId);
      else publicPosts.push({ id: postId, type, title, createdAt });
      archiveRows.push({ id: postId, createdAt, private: isPrivate });
    }
    const comments = [
      { label: "comment-first", post: publicPosts[0].id, body: "commentneedle M4QA جواب عن التزامن", root: null, replyTo: null },
      { label: "comment-second", post: publicPosts[0].id, body: "commentneedle M4QA second matching comment", root: null, replyTo: null },
      { label: "reply-root", post: publicPosts[1].id, body: "Context for a fictional reply", root: null, replyTo: null },
      { label: "reply-only", post: publicPosts[1].id, body: "replyneedle M4QA إجابة داخل رد", root: id("comment:reply-root"), replyTo: id("comment:reply-root") },
    ];
    for (const [index, comment] of comments.entries()) {
      await client.query(`INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id(`comment:${comment.label}`), comment.post, actor("B").userId,
        hash(`comment:${target.sessionId}:${index}`), comment.body, comment.root, comment.replyTo,
        new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString()]);
    }
    for (const [scenario, initiator, recipient, state, count, blocked] of [
      ["history65", "A", "B", "ACCEPTED", 65, false], ["history245", "A", "C", "ACCEPTED", 245, false],
      ["pending5", "A", "D", "PENDING", 5, false], ["rejected", "B", "D", "REJECTED", 1, false],
      ["bilateralBlock", "B", "E", "ACCEPTED", 2, true], ["empty", "C", "F", "ACCEPTED", 0, false],
    ] as const) {
      const conversationId = id(`conversation:${scenario}`), sender = actor(initiator), peer = actor(recipient);
      const [first, second] = [sender.userId, peer.userId].sort();
      await client.query(`INSERT INTO "DirectConversation" (id,"firstId","secondId","initiatorId",state,"pendingMessages","firstBlocked","secondBlocked")
        VALUES ($1,$2,$3,$4,$5::"DirectRequestState",$6,$7,$7)`,
      [conversationId, first, second, sender.userId, state, state === "PENDING" ? 5 : 1, blocked]);
      const messageIds: string[] = [];
      for (let sequence = 1; sequence <= count; sequence++) {
        const messageId = id(`message:${scenario}:${sequence}`); messageIds.push(messageId);
        const messageSender = state !== "ACCEPTED" || sequence % 2 ? sender.userId : peer.userId;
        await client.query(`INSERT INTO "DirectMessage" (id,"conversationId","senderId","submissionKey",body,"createdAt") VALUES ($1,$2,$3,$4,$5,$6)`,
          [messageId, conversationId, messageSender, hash(`message:${target.sessionId}:${scenario}:${sequence}`),
            `${scenario} ${String(sequence).padStart(3, "0")} — Fictional message رسالة تجريبية${sequence === 65 ? " MixedIdentifierCE101".repeat(20) : ""}`,
            new Date(Date.UTC(2026, 2, 1, 0, 0, sequence)).toISOString()]);
      }
      conversations.push({ scenario, id: conversationId, initiator, recipient, state, blocked, count, messageIds });
    }
    await client.query("COMMIT");
    const orderedArchive = [...archiveRows].sort((a, b) => a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1));
    return {
      syntheticOnly: true, marker: "M4QA", accounts, publicCommunity, privateCommunity, publicPosts, privatePosts, conversations,
      expected: {
        people: { query: "M4QA", verifiedCount: 21, excludedAlias: "unconfirmed", duplicateNames: ["E", "F"],
          orderedDirectoryIds: accounts.filter(row => row.verified).map(row => row.directoryId).sort() },
        archive: { query: "M4QA", publicCount: 24, privateMemberCount: 27, privateOnlyQuery: "PrivateOnly",
          publicResultIds: orderedArchive.filter(row => !row.private).map(row => row.id),
          privateMemberResultIds: orderedArchive.map(row => row.id),
          languageQueries: [
            { query: "pipeline hazards", postIds: publicPosts.slice(0, 8).map(row => row.id) },
            { query: "تطبيع قواعد البيانات", postIds: publicPosts.slice(8, 16).map(row => row.id) },
            { query: "CE101 مؤشرات", postIds: publicPosts.slice(16, 24).map(row => row.id) },
          ],
          commentOnly: { query: "commentneedle", postId: publicPosts[0].id, commentId: id("comment:comment-first") },
          replyOnly: { query: "replyneedle", postId: publicPosts[1].id, commentId: id("comment:reply-only"), rootId: id("comment:reply-root") } },
        privateMembership: { owner: "B", member: "A", pending: "E", outsider: "F" },
        initialHistory65: "046–065", initialHistory245: "226–245", historyDisplayLimit: 200,
      },
      instructions: [
        "Use independent temporary browser profiles; never real university addresses.",
        "Request a sign-in link, Open local confirmation, then Confirm sign-in in the same browser.",
        "Do not confirm the unconfirmed account before its negative discovery check.",
        "The accepted empty conversation is a fixture-only empty-state scenario, not a product creation flow.",
        "No session cookies, sign-in tokens, passwords or database URLs are seeded or recorded.",
        "Normal rate limits remain active. Avoid rapid repeat sign-ins; follow the existing cooldowns.",
      ],
    };
  } catch {
    try { await client.query("ROLLBACK"); }
    catch { throw new Error("Manual fixture setup failed and rollback is uncertain; preserve the session for inspection"); }
    throw new Error("Manual fixture setup failed; transaction rolled back; no existing data adopted");
  } finally { await client.end(); }
}
