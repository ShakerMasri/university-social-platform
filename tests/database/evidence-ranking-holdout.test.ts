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
import { normalizeArchiveText } from "../../src/server/archive/policy";
import { evidenceInput, evidenceCitationPath } from "../../src/server/evidence/policy";
import { retrieveEvidence, revalidateEvidence } from "../../src/server/evidence/service";
import { retrieveRankedEvidence, rankingCandidateLimit } from "../../tools/database/evidence-ranking-experiment";
import { retrieveRevisedEvidence } from "../../tools/database/evidence-ranking-revision";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { rankingHoldoutCases, rankingHoldoutPosts, rankingHoldoutVersion } from "../evaluation/evidence-ranking-holdout";

const enabled = process.env.M5_RANKING_HOLDOUT === "1", manifest = enabled ? readManifest() : null;
const name = process.env.M5_EVIDENCE_DATABASE;
if (enabled && !manifest?.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh owned ranking holdout target required");
const variants = ["baseline", "original", "revision"] as const;
type Variant = typeof variants[number];
const implementations = { baseline: retrieveEvidence, original: retrieveRankedEvidence, revision: retrieveRevisedEvidence };
const fixedId = (index: number) => `00000000-0000-4000-c000-${String(index).padStart(12, "0")}`;
const publicCommunity = fixedId(1), privateCommunity = fixedId(2), publicProbe = fixedId(3), privateProbe = fixedId(4);
const ids = new Map(rankingHoldoutPosts.map((post, index) => [post.key, fixedId(index + 100)]));
const keys = new Map([...ids].map(([key, id]) => [`post:${id}`, key]));
const sha = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
type Outcome = { retrieved: string[]; recall: number; top: number; support: number };
type Measurement = Outcome & { latencyMs: { samples: number[]; p50: number; p95: number } };
type Row = { id: string; gold: string[]; eligible: number; candidateCount: number; candidateGoldRecall: number; candidateAliases: string[];
  variants: Record<Variant, Measurement> };
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client, owner: { id: string; token: string };
const security = { forbiddenExposures: 0, citationRevalidations: 0, authorizationChecks: 0, revocationChecks: 0, completedProbes: [] as string[] };
async function actor() {
  const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
  await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
  await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, token };
}
const input = (q: string, community?: string) => new URLSearchParams({ q, ...(community ? { community } : {}) });
function noPrivate(result: Awaited<ReturnType<typeof retrieveEvidence>>) {
  const text = JSON.stringify(result);
  const exposed = text.includes(privateCommunity) || text.includes(privateProbe) || text.includes("SYNTHETIC_PRIVATE_RANKING_MARKER");
  if (exposed) security.forbiddenExposures++; expect(exposed).toBe(false);
}

describe.skipIf(!enabled)("M5-04A2 frozen holdout on one fresh PostgreSQL target", () => {
  beforeAll(async () => {
    if (!manifest) throw new Error("Focused runner required");
    const registration = JSON.parse(readFileSync(".cache/m5-ranking-registration.json", "utf8")) as { normalizedHashes: Record<string, string> };
    for (const [path, expected] of Object.entries(registration.normalizedHashes)) expect(sha(readFileSync(path, "utf8"))).toBe(expected);
    db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
    const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    migration = new Client({ connectionString: url }); await migration.connect();
    if ((await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count !== 0) throw new Error("Holdout requires empty fresh target; no clearing or adoption");
    owner = await actor();
    for (const [id, visibility] of [[publicCommunity, "PUBLIC"], [privateCommunity, "PRIVATE"]]) {
      await migration.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Synthetic ranking holdout\',\'\',$3::"CommunityVisibility")', [id, owner.id, visibility]);
      await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [id, owner.id]);
    }
    for (const source of rankingHoldoutPosts) await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'DISCUSSION\',$4,$5,$6)',
      [ids.get(source.key), publicCommunity, owner.id, source.title, source.body, source.createdAt]);
  });
  afterAll(async () => {
    writeFileSync(".cache/m5-ranking-holdout-security.json", JSON.stringify(security, null, 2));
    await db?.$disconnect(); await migration?.end();
  });

  it("compares all three variants with frozen labels, balanced order and bounded horizon diagnostics", async () => {
    const rows: Row[] = [], allLatencies: Record<Variant, number[]> = { baseline: [], original: [], revision: [] };
    expect(rankingHoldoutCases).toHaveLength(12);
    expect(new Set(rankingHoldoutPosts.map(source => source.key)).size).toBe(rankingHoldoutPosts.length);
    for (const [caseIndex, query] of rankingHoldoutCases.entries()) {
      for (const key of query.gold) expect(rankingHoldoutPosts.find(source => source.key === key)?.body.includes(query.anchors[key])).toBe(true);
      const reader = await actor(), parameters = input(query.query), parsed = evidenceInput(parameters);
      // Bounded metadata only: never COUNT/scan all database matches or expand
      // the candidate query. Total eligibility comes from this frozen fixture.
      const candidates = await authorized(db, reader.token, async (tx, userId) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
        return tx.$queryRaw<{ id: string }[]>(archiveCandidateQuery(parsed, userId));
      });
      expect(candidates.length).toBeLessThanOrEqual(rankingCandidateLimit);
      const candidateAliases = candidates.map(row => { const key = keys.get(`post:${row.id}`); if (!key) throw new Error("Unexpected candidate"); return key; });
      const expected = rankingHoldoutPosts.filter(source => parsed.terms.every(term => normalizeArchiveText(`${source.title} ${source.body}`).includes(term)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || ids.get(b.key)!.localeCompare(ids.get(a.key)!));
      expect(expected).toHaveLength(query.expectedEligible);
      expect(candidateAliases).toEqual(expected.slice(0, rankingCandidateLimit).map(source => source.key));
      const outcomes = new Map<Variant, Outcome>(), timings: Record<Variant, number[]> = { baseline: [], original: [], revision: [] };
      const order = (round: number) => variants.map((_, offset) => variants[(caseIndex + round + offset) % variants.length]);
      async function attempt(variant: Variant) {
        const started = performance.now(), result = await implementations[variant](db, reader.token, parameters), elapsed = performance.now() - started;
        expect(result.interrupted).toBe(false); expect(result.evidence.length).toBeLessThanOrEqual(5); noPrivate(result);
        const retrieved = result.evidence.map(source => {
          const key = keys.get(source.sourceId); if (!key) throw new Error("Unexpected holdout source");
          expect(source.citation).toEqual({ communityId: publicCommunity, postId: ids.get(key), commentId: null }); return key;
        });
        await revalidateEvidence(db, reader.token, result.evidence); security.citationRevalidations++;
        const relevant = query.gold.filter(key => retrieved.includes(key));
        const support = query.gold.filter(key => result.evidence.some(source => keys.get(source.sourceId) === key && source.text.includes(query.anchors[key])));
        return { elapsed, outcome: { retrieved, recall: relevant.length / query.gold.length, top: Number(query.gold.includes(retrieved[0])), support: support.length / query.gold.length } };
      }
      for (const variant of order(0)) outcomes.set(variant, (await attempt(variant)).outcome);
      // One warmup plus five measurements per variant: 18 real retrievals per
      // reader, below the 30-attempt cap. No limiter resets or clock changes.
      for (let round = 0; round < 5; round++) for (const variant of order(round)) {
        const current = await attempt(variant); expect(current.outcome).toEqual(outcomes.get(variant));
        timings[variant].push(current.elapsed); allLatencies[variant].push(current.elapsed);
      }
      rows.push({ id: query.id, gold: query.gold, eligible: expected.length, candidateCount: candidates.length,
        candidateGoldRecall: query.gold.filter(key => candidateAliases.includes(key)).length / query.gold.length, candidateAliases,
        variants: Object.fromEntries(variants.map(variant => [variant, { ...outcomes.get(variant)!, latencyMs: { samples: timings[variant], p50: percentile(timings[variant], 0.5), p95: percentile(timings[variant], 0.95) } }])) as Record<Variant, Measurement> });
    }
    const comparisons = rows.map(row => ({ id: row.id, deltas: Object.fromEntries((["baseline", "original"] as const).map(before => [before, {
      recall: row.variants.revision.recall - row.variants[before].recall, top: row.variants.revision.top - row.variants[before].top,
      support: row.variants.revision.support - row.variants[before].support,
      medianLatencyMs: row.variants.revision.latencyMs.p50 - row.variants[before].latencyMs.p50,
      p95LatencyMs: row.variants.revision.latencyMs.p95 - row.variants[before].latencyMs.p95 }])) }));
    const regressions = (variant: Variant, before: Variant) => rows.filter(row => (["recall", "top", "support"] as const).some(metric => row.variants[variant][metric] < row.variants[before][metric])).map(row => row.id);
    const summary = Object.fromEntries(variants.map(variant => [variant, { recallAt5: average(rows.map(row => row.variants[variant].recall)),
      topRelevance: average(rows.map(row => row.variants[variant].top)), passageRecall: average(rows.map(row => row.variants[variant].support)),
      latencyMs: { samples: allLatencies[variant].length, p50: percentile(allLatencies[variant], 0.5), p95: percentile(allLatencies[variant], 0.95), max: Math.max(...allLatencies[variant]) } }]));
    writeFileSync(".cache/m5-ranking-holdout.json", JSON.stringify({ rankingHoldoutVersion,
      registrationSha256: sha(readFileSync(".cache/m5-ranking-registration.json", "utf8")),
      environment: { node: process.version, postgres: (await migration.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version },
      method: { cases: rows.length, answerable: rows.length, posts: rankingHoldoutPosts.length, warmups: 36, measurements: 180,
        sameTarget: true, balancedRoundRobin: true, samplesPerVariantCase: 5, candidateLimit: rankingCandidateLimit, rawQueries: true },
      summary, regressions: { originalVsBaseline: regressions("original", "baseline"), revisionVsBaseline: regressions("revision", "baseline"), revisionVsOriginal: regressions("revision", "original") },
      comparisons, rows }, null, 2));
  }, 60000);

  it("checks outsider/pending/member/revoked/filter access for all three variants", async () => {
    for (const [id, community, body] of [[publicProbe, publicCommunity, "SCOPE91 public synthetic routing context."], [privateProbe, privateCommunity, "SCOPE91 SYNTHETIC_PRIVATE_RANKING_MARKER member context."]]) {
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'DISCUSSION\',\'Scope probe\',$4)', [id, community, owner.id, body]);
    }
    for (const variant of variants) for (const state of ["outsider", "pending", "member", "revoked", "filtered"]) {
      const reader = await actor();
      if (["pending", "member", "revoked"].includes(state)) await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,$3::"MembershipStatus")', [privateCommunity, reader.id, state === "pending" ? "PENDING" : "MEMBER"]);
      if (state === "revoked") {
        const before = await implementations[variant](db, reader.token, input("SCOPE91"));
        expect(before.evidence.some(source => source.citation.postId === privateProbe)).toBe(true);
        await changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id });
        await expect(revalidateEvidence(db, reader.token, before.evidence)).rejects.toMatchObject({ status: 404 }); security.revocationChecks++;
      }
      if (state === "filtered") await expect(implementations[variant](db, reader.token, input("SCOPE91", privateCommunity))).rejects.toMatchObject({ status: 404 });
      else {
        const result = await implementations[variant](db, reader.token, input("SCOPE91"));
        if (state !== "member") noPrivate(result);
        expect(result.evidence.map(source => source.citation.postId).sort()).toEqual((state === "member" ? [publicProbe, privateProbe] : [publicProbe]).sort());
        await revalidateEvidence(db, reader.token, result.evidence); security.citationRevalidations++;
      }
      security.authorizationChecks++;
    }
    security.completedProbes.push("all-variant-access-and-revocation");
  });

  it("preserves original validation and one shared durable 30-attempt budget", async () => {
    const reader = await actor(), key = digest(`m5-evidence-retrieval:${reader.id}`);
    const invalid = [new URLSearchParams({ q: "x".repeat(201) }), input("a b c d e f g h i"), input("ab\u200b"), new URLSearchParams("q=x&q=y"),
      new URLSearchParams({ q: "SCOPE91", after: "" }), new URLSearchParams({ q: "SCOPE91", community: "invalid" }), new URLSearchParams({ q: "SCOPE91", type: "INVALID" })];
    for (const variant of variants) for (const parameters of invalid) await expect(implementations[variant](db, reader.token, parameters)).rejects.toBeInstanceOf(InputError);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: key } })).toBeNull();
    const unknown = randomUUID();
    for (let i = 0; i < 30; i++) await expect(implementations[variants[i % 3]](db, reader.token, input("SCOPE91", unknown))).rejects.toMatchObject({ status: 404 });
    for (const variant of variants) await expect(implementations[variant](db, reader.token, input("SCOPE91"))).rejects.toMatchObject({ status: 429 });
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: key } })).hits).toBe(30);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`m4-archive-search:${reader.id}`) } })).toBeNull();
    const filtered = await actor();
    for (const variant of variants) {
      expect((await implementations[variant](db, filtered.token, input("SCOPE91' OR1=1--"))).evidence).toEqual([]);
      expect((await implementations[variant](db, filtered.token, new URLSearchParams({ q: "SCOPE91", community: publicCommunity, type: "QUESTION" }))).evidence).toEqual([]);
    }
    security.completedProbes.push("input-sql-filters-and-shared-budget");
  });

  it("rechecks access when removal wins the revised retrieval lock queue", async () => {
    const reader = await actor();
    await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [privateCommunity, reader.id]);
    const lock = new Client({ connectionString: databaseUrl(manifest!, name!, "migration") }); await lock.connect();
    await lock.query("BEGIN"); await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [privateCommunity]);
    async function waitForLocks(minimum: number) {
      for (let round = 0; round < 100; round++) {
        const result = await migration.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted");
        if (result.rows[0].count >= minimum) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error("Expected fresh-target advisory lock queue");
    }
    let removal: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
    try {
      removal = changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id }); await waitForLocks(1);
      pending = retrieveRevisedEvidence(db, reader.token, input("SCOPE91")).then(result => {
        noPrivate(result); expect(result.evidence.map(source => source.citation.postId)).toEqual([publicProbe]); expect(result.interrupted).toBe(true);
      });
      await waitForLocks(2); await lock.query("COMMIT"); await removal; await pending;
    } finally { await lock.query("ROLLBACK"); await lock.end(); await Promise.allSettled([removal, pending].filter(Boolean)); }
    security.revocationChecks++; security.completedProbes.push("queued-revocation");
  });

  it("checks private reply parents, stale fingerprints, logout and creator/comment distinctions", async () => {
    const reader = await actor(), outsider = await actor(), root = randomUUID(), reply = randomUUID();
    await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [privateCommunity, reader.id]);
    for (const [id, body, rootId] of [[root, "Synthetic root discussion", null], [reply, "REPLY91 synthetic explanation for permitted member readers.", root]]) {
      await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"rootId","replyToId") VALUES ($1,$2,$3,$4,$5,$6,$6)', [id, privateProbe, owner.id, sha(id!), body, rootId]);
    }
    for (const variant of variants) {
      const result = await implementations[variant](db, reader.token, input("REPLY91", privateCommunity));
      expect(result.evidence[0].kind).toBe("reply");
      expect(result.evidence[0].citation).toEqual({ communityId: privateCommunity, postId: privateProbe, commentId: reply });
      expect(evidenceCitationPath(result.evidence[0].citation, "ar")).toContain(`?comment=${reply}`);
      await revalidateEvidence(db, reader.token, result.evidence); security.citationRevalidations++;
      await expect(revalidateEvidence(db, outsider.token, result.evidence)).rejects.toMatchObject({ status: 404 });
      await expect(revalidateEvidence(db, reader.token, [{ ...result.evidence[0], citation: { ...result.evidence[0].citation, postId: publicProbe } }])).rejects.toMatchObject({ status: 404 });
    }
    const before = await retrieveRevisedEvidence(db, reader.token, input("REPLY91"));
    await migration.query('UPDATE "Comment" SET body=\'REPLY91 edited synthetic source.\' WHERE id=$1', [reply]);
    await expect(revalidateEvidence(db, reader.token, before.evidence)).rejects.toMatchObject({ status: 404 });
    await logout(db, reader.token);
    for (const variant of variants) await expect(implementations[variant](db, reader.token, input("REPLY91"))).rejects.toMatchObject({ status: 401 });
    await migration.query('DELETE FROM "CommunityMembership" WHERE "communityId"=$1 AND "userId"=$2', [privateCommunity, owner.id]);
    for (const variant of variants) {
      expect((await implementations[variant](db, owner.token, input("REPLY91", privateCommunity))).evidence).toEqual([]);
      expect((await implementations[variant](db, owner.token, input("SCOPE91", privateCommunity))).evidence).toHaveLength(1);
    }
    security.completedProbes.push("citation-integrity-staleness-logout-creator-policy");
  });
});
