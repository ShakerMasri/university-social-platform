import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { digest, newToken } from "../../src/server/identity/policy";
import { logout } from "../../src/server/identity/service";
import { authorized, changeMembership } from "../../src/server/communities/service";
import { InputError } from "../../src/server/communities/http";
import { archiveCandidateQuery } from "../../src/server/archive/service";
import { archiveInput } from "../../src/server/archive/policy";
import { evidenceCitationPath } from "../../src/server/evidence/policy";
import { retrieveEvidence, revalidateEvidence } from "../../src/server/evidence/service";
import { retrieveCommentEvidence } from "../../tools/database/evidence-comment-experiment";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { commentCases, commentCorpusVersion } from "../evaluation/evidence-comment-corpus";

const enabled = process.env.M5_COMMENT_SELECTION === "1", manifest = enabled ? readManifest() : null;
const name = process.env.M5_EVIDENCE_DATABASE;
if (enabled && !manifest?.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh owned comment-selection target required");
const variants = ["baseline", "experiment"] as const;
type Variant = typeof variants[number];
const implementations = { baseline: retrieveEvidence, experiment: retrieveCommentEvidence };
const fixedId = (index: number) => `00000000-0000-4000-d000-${String(index).padStart(12, "0")}`;
const publicCommunity = fixedId(1), privateCommunity = fixedId(2);
const postIds = new Map(commentCases.map((row, index) => [row.id, fixedId(index + 100)]));
const comments = commentCases.flatMap(row => row.comments.map(comment => ({ ...comment, caseId: row.id, private: row.private })));
const commentIds = new Map(comments.map((row, index) => [row.key, fixedId(index + 200)]));
const aliases = new Map<string, string>([...postIds].map(([key, id]) => [`post:${id}`, `${key}-post`]));
for (const [key, id] of commentIds) aliases.set(`comment:${id}`, key);
const sha = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
type Outcome = { retrieved: string[]; relevant: number; returned: number; recall: number | null; support: number | null };
type Measurement = Outcome & { latencyMs: { samples: number[]; p50: number; p95: number } };
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client, owner: { id: string; token: string };
const security = { forbiddenExposures: 0, citationChecks: 0, permissionChecks: 0, revocationChecks: 0, completedProbes: [] as string[] };
const parameters = (q: string, community?: string) => new URLSearchParams({ q, ...(community ? { community } : {}) });
async function actor() {
  const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
  await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
  await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, token };
}
function noPrivate(result: Awaited<ReturnType<typeof retrieveEvidence>>) {
  const serialized = JSON.stringify(result);
  const exposed = serialized.includes(privateCommunity) || commentCases.filter(row => row.private).some(row => serialized.includes(postIds.get(row.id)!)) || comments.filter(row => row.private).some(row => serialized.includes(commentIds.get(row.key)!));
  if (exposed) security.forbiddenExposures++; expect(exposed).toBe(false);
}

describe.skipIf(!enabled)("M5-04B post/comment selection on fresh PostgreSQL", () => {
  beforeAll(async () => {
    if (!manifest) throw new Error("Focused runner required");
    const registration = JSON.parse(readFileSync(".cache/m5-comment-registration.json", "utf8")) as { hashes: Record<string, string> };
    for (const [path, expected] of Object.entries(registration.hashes)) expect(sha(readFileSync(path, "utf8"))).toBe(expected);
    db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
    const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    migration = new Client({ connectionString: url }); await migration.connect();
    if ((await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count !== 0) throw new Error("Fresh empty target required; no adoption or clearing");
    owner = await actor();
    for (const [id, visibility] of [[publicCommunity, "PUBLIC"], [privateCommunity, "PRIVATE"]]) {
      await migration.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Synthetic selection evaluation\',\'\',$3::"CommunityVisibility")', [id, owner.id, visibility]);
      await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [id, owner.id]);
    }
    for (const [index, row] of commentCases.entries()) await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,$4::"PostType",$5,$6,$7)',
      [postIds.get(row.id), row.private ? privateCommunity : publicCommunity, owner.id, row.type, row.title, row.body, `2024-03-${String(index + 1).padStart(2, "0")}T12:00:00Z`]);
    for (const [index, row] of comments.entries()) {
      const root = row.replyTo ? commentIds.get(row.replyTo) : null;
      await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"createdAt","rootId","replyToId") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
        [commentIds.get(row.key), postIds.get(row.caseId), owner.id, sha(row.key), row.body, `2026-11-${String(index + 1).padStart(2, "0")}T12:00:00Z`, root]);
    }
  });
  afterAll(async () => { writeFileSync(".cache/m5-comment-security.json", JSON.stringify(security, null, 2)); await db?.$disconnect(); await migration?.end(); });

  it("compares unchanged production source choices with the frozen selection experiment", async () => {
    const rows: { id: string; gold: string[]; variants: Record<Variant, Measurement> }[] = [];
    const allLatencies: Record<Variant, number[]> = { baseline: [], experiment: [] };
    expect(commentCases).toHaveLength(10);
    for (const [caseIndex, row] of commentCases.entries()) {
      for (const key of row.gold) {
        const body = key === `${row.id}-post` ? row.body : row.comments.find(comment => comment.key === key)?.body;
        expect(body?.includes(row.anchors[key])).toBe(true);
      }
      const reader = await actor();
      if (row.actor === "member") await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [privateCommunity, reader.id]);
      const outcomes = new Map<Variant, Outcome>(), timings: Record<Variant, number[]> = { baseline: [], experiment: [] };
      const order = (round: number) => (caseIndex + round) % 2 ? [...variants].reverse() : [...variants];
      async function attempt(variant: Variant) {
        const started = performance.now(), result = await implementations[variant](db, reader.token, parameters(row.query)), elapsed = performance.now() - started;
        expect(result.interrupted).toBe(false); expect(result.evidence.length).toBeLessThanOrEqual(5);
        expect(new Set(result.evidence.map(source => source.citation.postId)).size).toBe(result.evidence.length);
        if (row.actor !== "member") noPrivate(result);
        const retrieved = result.evidence.map(source => {
          const key = aliases.get(source.sourceId); if (!key) throw new Error("Unexpected source outside frozen corpus");
          const comment = comments.find(comment => comment.key === key);
          expect(source.citation).toEqual({ communityId: row.private ? privateCommunity : publicCommunity, postId: postIds.get(row.id), commentId: comment ? commentIds.get(key) : null });
          expect(source.kind).toBe(comment ? comment.replyTo ? "reply" : "comment" : "post");
          expect(evidenceCitationPath(source.citation, "ar")).toBe(`/ar/communities/${source.citation.communityId}/posts/${source.citation.postId}${comment ? `?comment=${commentIds.get(key)}` : ""}`);
          return key;
        });
        if (variant === "baseline") expect(retrieved).toEqual(row.baseline);
        await revalidateEvidence(db, reader.token, result.evidence); security.citationChecks++;
        const relevant = row.gold.filter(key => retrieved.includes(key));
        const support = row.gold.filter(key => result.evidence.some(source => aliases.get(source.sourceId) === key && source.text.includes(row.anchors[key])));
        return { elapsed, outcome: { retrieved, relevant: relevant.length, returned: retrieved.length, recall: row.gold.length ? relevant.length / row.gold.length : null,
          support: row.gold.length ? support.length / row.gold.length : null } };
      }
      for (const variant of order(0)) outcomes.set(variant, (await attempt(variant)).outcome);
      for (let round = 0; round < 5; round++) for (const variant of order(round)) {
        const current = await attempt(variant); expect(current.outcome).toEqual(outcomes.get(variant)); timings[variant].push(current.elapsed); allLatencies[variant].push(current.elapsed);
      }
      rows.push({ id: row.id, gold: row.gold, variants: Object.fromEntries(variants.map(variant => [variant, { ...outcomes.get(variant)!, latencyMs: {
        samples: timings[variant], p50: percentile(timings[variant], 0.5), p95: percentile(timings[variant], 0.95) } }])) as Record<Variant, Measurement> });
    }
    const summary = Object.fromEntries(variants.map(variant => {
      const positive = rows.filter(row => row.gold.length), returned = rows.reduce((sum, row) => sum + row.variants[variant].returned, 0);
      return [variant, { sourceRelevance: rows.reduce((sum, row) => sum + row.variants[variant].relevant, 0) / returned, returnedSources: returned,
        sourceRecall: average(positive.map(row => row.variants[variant].recall!)), passageRecall: average(positive.map(row => row.variants[variant].support!)),
        latencyMs: { samples: allLatencies[variant].length, p50: percentile(allLatencies[variant], 0.5), p95: percentile(allLatencies[variant], 0.95), max: Math.max(...allLatencies[variant]) } }];
    }));
    const comparisons = rows.map(row => ({ id: row.id, recallDelta: row.gold.length ? row.variants.experiment.recall! - row.variants.baseline.recall! : null,
      passageRecallDelta: row.gold.length ? row.variants.experiment.support! - row.variants.baseline.support! : null,
      relevantSourceDelta: row.variants.experiment.relevant - row.variants.baseline.relevant,
      medianLatencyDeltaMs: row.variants.experiment.latencyMs.p50 - row.variants.baseline.latencyMs.p50, p95LatencyDeltaMs: row.variants.experiment.latencyMs.p95 - row.variants.baseline.latencyMs.p95 }));
    writeFileSync(".cache/m5-comment-results.json", JSON.stringify({ commentCorpusVersion, registrationSha256: sha(readFileSync(".cache/m5-comment-registration.json", "utf8")),
      method: { cases: rows.length, answerable: rows.filter(row => row.gold.length).length, posts: commentCases.length, comments: comments.length,
        warmups: 20, measurements: 100, sameTarget: true, balancedOrder: true, samplesPerCaseVariant: 5, realBudgets: true,
        candidateLimit: 21, sourceLimit: 5, commentLimitPerParent: 1, relevanceDenominator: "returned sources", passageDenominator: "answerable cases" },
      summary, regressions: comparisons.filter(row => (row.recallDelta ?? 0) < 0 || (row.passageRecallDelta ?? 0) < 0 || row.relevantSourceDelta < 0).map(row => row.id), comparisons, rows }, null, 2));
  }, 60000);

  it("retains outsider/pending/member/revoked/filter policies and revokes selected comments", async () => {
    const query = "ذاكرة VM77";
    for (const variant of variants) for (const state of ["outsider", "pending", "member", "revoked", "filtered"]) {
      const reader = await actor();
      if (["pending", "member", "revoked"].includes(state)) await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,$3::"MembershipStatus")', [privateCommunity, reader.id, state === "pending" ? "PENDING" : "MEMBER"]);
      if (state === "revoked") {
        const before = await implementations[variant](db, reader.token, parameters(query)); expect(before.evidence).toHaveLength(1);
        await changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id });
        await expect(revalidateEvidence(db, reader.token, before.evidence)).rejects.toMatchObject({ status: 404 }); security.revocationChecks++;
      }
      if (state === "filtered") await expect(implementations[variant](db, reader.token, parameters(query, privateCommunity))).rejects.toMatchObject({ status: 404 });
      else {
        const result = await implementations[variant](db, reader.token, parameters(query));
        if (state === "member") expect(result.evidence.map(source => aliases.get(source.sourceId))).toEqual([variant === "baseline" ? "private-member-post" : "private-reply"]);
        else { expect(result.evidence).toEqual([]); noPrivate(result); }
        await revalidateEvidence(db, reader.token, result.evidence); security.citationChecks++;
      }
      security.permissionChecks++;
    }
    security.completedProbes.push("access-and-sequential-revocation");
  });

  it("keeps original limits, bound SQL, filters and one shared durable attempt budget", async () => {
    const reader = await actor(), key = digest(`m5-evidence-retrieval:${reader.id}`);
    const invalid = [parameters("x".repeat(201)), parameters("a b c d e f g h i"), parameters("ab\u200b"), new URLSearchParams("q=x&q=y"),
      new URLSearchParams({ q: "LOCK71", after: "" }), new URLSearchParams({ q: "LOCK71", type: "INVALID" }), parameters("LOCK71", "invalid")];
    for (const variant of variants) for (const value of invalid) await expect(implementations[variant](db, reader.token, value)).rejects.toBeInstanceOf(InputError);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: key } })).toBeNull();
    const unknown = randomUUID();
    for (let i = 0; i < 30; i++) await expect(implementations[variants[i % 2]](db, reader.token, parameters("LOCK71", unknown))).rejects.toMatchObject({ status: 404 });
    for (const variant of variants) await expect(implementations[variant](db, reader.token, parameters("LOCK71"))).rejects.toMatchObject({ status: 429 });
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(30);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`m4-archive-search:${reader.id}`) } })).toBeNull();
    const filtered = await actor();
    for (const variant of variants) {
      expect((await implementations[variant](db, filtered.token, parameters("LOCK71' OR1=1--"))).evidence).toEqual([]);
      expect((await implementations[variant](db, filtered.token, new URLSearchParams({ q: "LOCK71", community: publicCommunity, type: "DISCUSSION" }))).evidence).toEqual([]);
    }
    security.completedProbes.push("input-sql-filters-and-shared-budget");
  });

  it("rechecks access when removal wins the actual comment retrieval lock queue", async () => {
    const reader = await actor(); await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [privateCommunity, reader.id]);
    const lock = new Client({ connectionString: databaseUrl(manifest!, name!, "migration") }); await lock.connect();
    await lock.query("BEGIN"); await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [privateCommunity]);
    async function waitForLocks(minimum: number) {
      for (let round = 0; round < 100; round++) {
        const result = await migration.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
        if (result.rows[0].count >= minimum) return; await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error("Expected fresh-target advisory lock queue");
    }
    let removal: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
    try {
      removal = changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id }); await waitForLocks(1);
      pending = retrieveCommentEvidence(db, reader.token, parameters("ذاكرة VM77")).then(result => { noPrivate(result); expect(result.evidence).toEqual([]); expect(result.interrupted).toBe(true); });
      await waitForLocks(2); await lock.query("COMMIT"); await removal; await pending;
    } finally { await lock.query("ROLLBACK"); await lock.end(); await Promise.allSettled([removal, pending].filter(Boolean)); }
    security.revocationChecks++; security.completedProbes.push("queued-revocation");
  });

  it("checks reply identity, forged parents, source edits, logout and private creator distinctions", async () => {
    const reader = await actor(), outsider = await actor();
    await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [privateCommunity, reader.id]);
    const result = await retrieveCommentEvidence(db, reader.token, parameters("ذاكرة VM77", privateCommunity));
    expect(result.evidence[0].kind).toBe("reply");
    await expect(revalidateEvidence(db, outsider.token, result.evidence)).rejects.toMatchObject({ status: 404 });
    await expect(revalidateEvidence(db, reader.token, [{ ...result.evidence[0], citation: { ...result.evidence[0].citation, postId: postIds.get("en-answer") } }])).rejects.toMatchObject({ status: 404 });
    await migration.query('UPDATE "Comment" SET body=\'ذاكرة VM77 نص تجريبي معدل.\' WHERE id=$1', [commentIds.get("private-reply")]);
    await expect(revalidateEvidence(db, reader.token, result.evidence)).rejects.toMatchObject({ status: 404 });
    const fresh = await retrieveCommentEvidence(db, reader.token, parameters("ذاكرة VM77"));
    await revalidateEvidence(db, reader.token, fresh.evidence); security.citationChecks++;
    await migration.query('UPDATE "Post" SET title=\'ذاكرة VM77 عنوان معدل\' WHERE id=$1', [postIds.get("private-member")]);
    await expect(revalidateEvidence(db, reader.token, fresh.evidence)).rejects.toMatchObject({ status: 404 });
    await logout(db, reader.token); await expect(retrieveCommentEvidence(db, reader.token, parameters("ذاكرة VM77"))).rejects.toMatchObject({ status: 401 });
    const ownerBefore = await retrieveCommentEvidence(db, owner.token, parameters("ذاكرة VM77"));
    await migration.query('DELETE FROM "CommunityMembership" WHERE "communityId"=$1 AND "userId"=$2', [privateCommunity, owner.id]);
    await expect(revalidateEvidence(db, owner.token, ownerBefore.evidence)).rejects.toMatchObject({ status: 404 });
    for (const variant of variants) expect((await implementations[variant](db, owner.token, parameters("ذاكرة VM77", privateCommunity))).evidence.map(source => source.sourceId)).toEqual([`post:${postIds.get("private-member")}`]);
    security.completedProbes.push("citation-staleness-logout-creator-policy");
  });

  it("keeps one source per post, five-source cutoff, and the existing 21-candidate bound", async () => {
    const expected: { post: string; comment: string }[] = [];
    for (let index = 0; index < 24; index++) {
      const post = randomUUID(), first = randomUUID(), second = randomUUID(); expected.push({ post, comment: first });
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'QUESTION\',\'BOUND91 thread\',\'What does BOUND91 mean?\',$4)', [post, publicCommunity, owner.id, new Date(Date.UTC(2026, 10, 16, 0, index))]);
      for (const [id, day] of [[first, 10], [second, 11]] as const) await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"createdAt") VALUES ($1,$2,$3,$4,\'BOUND91 permitted synthetic explanation.\',$5)', [id, post, owner.id, sha(id), `2026-11-${day}T12:00:00Z`]);
    }
    const reader = await actor(), query = parameters("BOUND91");
    const candidates = await authorized(db, reader.token, async (tx, userId) => {
      await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`; return tx.$queryRaw<{ id: string }[]>(archiveCandidateQuery(archiveInput(query), userId));
    }); expect(candidates).toHaveLength(21);
    const result = await retrieveCommentEvidence(db, reader.token, query);
    expect(result.evidence.map(source => source.citation)).toEqual(expected.slice(-5).reverse().map(row => ({ communityId: publicCommunity, postId: row.post, commentId: row.comment })));
    await revalidateEvidence(db, reader.token, result.evidence); security.citationChecks++;
    security.completedProbes.push("21-candidates-five-posts-one-comment-each");
  });
});
