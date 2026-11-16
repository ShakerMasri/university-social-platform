import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { digest, newToken } from "../../src/server/identity/policy";
import { changeMembership } from "../../src/server/communities/service";
import { InputError, validInput } from "../../src/server/communities/http";
import { retrieveEvidence, revalidateEvidence } from "../../src/server/evidence/service";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { corpusComments, corpusPosts, corpusVersion, evaluationQueries, privateMarker, supportingAnchors } from "../evaluation/evidence-corpus";
import { prepareEvidenceQuery } from "../../tools/database/evidence-query-experiment";

// Quality/latency evaluation is opt-in; ordinary database campaigns skip it.
const evaluating = process.env.M5_EVIDENCE_EVALUATION === "1";
const experimenting = process.env.M5_QUERY_PREPARATION_EXPERIMENT === "1";
const manifest = evaluating ? readManifest() : null, name = process.env.M5_EVIDENCE_DATABASE;
if (evaluating && !manifest?.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh owned evaluation target required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
const fixedId = (index: number) => `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`;
const publicCommunity = fixedId(1), privateCommunity = fixedId(2);
const postIds = new Map(corpusPosts.map((post, index) => [post.key, fixedId(index + 100)]));
const commentIds = new Map(corpusComments.map((comment, index) => [comment.key, fixedId(index + 200)]));
const sourceKeys = new Map<string, string>([
  ...[...postIds].map(([key, id]) => [`post:${id}`, key] as const),
  ...[...commentIds].map(([key, id]) => [`comment:${id}`, key] as const),
]);
const samplesPerQuery = 5;
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * quantile) - 1] : null;
}
function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type BaselineReport = {
  corpusSha256: string; applicationSha256: string; summary: Record<string, unknown>;
  rows: { id: string; gold: string[]; status: number; retrieved: string[]; recallAt5: number | null;
    topRelevant: boolean | null; supportingPassageRecallAt5: number | null; latencyMs: { p50: number; p95: number } }[];
};

describe.skipIf(!evaluating)("M5-02 synthetic retrieval quality on fresh PostgreSQL", () => {
  beforeAll(async () => {
    if (!manifest) throw new Error("Evaluation must use its focused runner");
    db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
    const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    migration = new Client({ connectionString: url }); await migration.connect();
    // Name/marker checks precede every fixture write. Refuse a populated target,
    // including a previously used evaluation target; never clear/reuse its data.
    const count = await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"');
    if (count.rows[0].count !== 0) throw new Error("Evaluation requires a fresh empty target");
  });
  afterAll(async () => { await db?.$disconnect(); await migration?.end(); });

  async function actor() {
    const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
    await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
    await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { id, token };
  }

  it("records quality and repeated service latency without changing retrieval behavior", async () => {
    const corpusSha256 = hash(readFileSync("tests/evaluation/evidence-corpus.ts", "utf8").replace(/\r\n/g, "\n"));
    const sourceFiles = ["src/server/archive/service.ts", "src/server/archive/policy.ts", "src/server/evidence/service.ts", "src/server/evidence/policy.ts", "src/server/communities/service.ts"];
    const applicationSha256 = hash(sourceFiles.map(path => readFileSync(path, "utf8").replace(/\r\n/g, "\n")).join("\n"));
    // Reuse the completed M5-02 run; do not rerun its PostgreSQL baseline. Only
    // accept a report for this exact corpus, gold ordering and application code.
    const baselineText = experimenting ? readFileSync(".cache/m5-query-baseline.json", "utf8") : null;
    const baseline = baselineText ? JSON.parse(baselineText) as BaselineReport : null;
    if (baseline) {
      expect(baseline.corpusSha256).toBe(corpusSha256); expect(baseline.applicationSha256).toBe(applicationSha256);
      expect(baseline.rows.map(row => ({ id: row.id, gold: row.gold }))).toEqual(evaluationQueries.map(query => ({ id: query.id, gold: query.gold })));
    }
    const owner = await actor();
    for (const [id, visibility] of [[publicCommunity, "PUBLIC"], [privateCommunity, "PRIVATE"]]) {
      await migration.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,$3,\'\',$4::"CommunityVisibility")', [id, owner.id, "Synthetic evaluation", visibility]);
      await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [id, owner.id]);
    }
    for (const [index, post] of corpusPosts.entries()) {
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'DISCUSSION\',$4,$5,$6)',
        [postIds.get(post.key), post.private ? privateCommunity : publicCommunity, owner.id, post.title, post.body, post.createdAt ?? `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`]);
    }
    for (const [index, comment] of corpusComments.entries()) {
      const root = "root" in comment && comment.root ? commentIds.get(comment.root) : null;
      await migration.query('INSERT INTO "Comment" (id,"postId","authorId","submissionKey",body,"createdAt","rootId","replyToId") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
        [commentIds.get(comment.key), postIds.get(comment.post), owner.id, hash(`m5-02:${comment.key}`), comment.body, `2026-10-${24 + index}T12:00:00Z`, root]);
    }
    const allSources = [...corpusPosts, ...corpusComments];
    expect(new Set(allSources.map(source => source.key)).size).toBe(allSources.length);
    for (const query of evaluationQueries) for (const key of query.gold) expect(allSources.find(source => source.key === key)?.body.includes(supportingAnchors[key])).toBe(true);

    const rows = [], successfulLatency: number[] = [];
    let forbiddenExposures = 0, measuredCalls = 0, warmupCalls = 0, revocationChecks = 0;
    for (const query of evaluationQueries) {
      // Separate fresh readers keep each case below the real 30/15-minute budget;
      // no budget reset, disabled limiter or synthetic clock manipulation.
      const reader = await actor();
      if (query.actor) await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,$3::"MembershipStatus")',
        [privateCommunity, reader.id, query.actor === "pending" ? "PENDING" : "MEMBER"]);
      const parameters = new URLSearchParams({ q: query.query, ...(query.privateFilter ? { community: privateCommunity } : {}) });
      const retrieve = () => retrieveEvidence(db, reader.token, experimenting ? validInput(() => prepareEvidenceQuery(parameters)) : parameters);
      if (query.actor === "revoked") {
        const before = await retrieve();
        expect(before.evidence.some(item => item.citation.communityId === privateCommunity)).toBe(true);
        await changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id });
        await expect(revalidateEvidence(db, reader.token, before.evidence)).rejects.toMatchObject({ status: 404 });
        revocationChecks++;
      }
      async function attempt() {
        const started = performance.now();
        try {
          const result = await retrieve();
          const elapsedMs = performance.now() - started;
          expect(result.evidence.length).toBeLessThanOrEqual(5); expect(result.interrupted).toBe(false);
          if (query.actor !== "member") {
            const serialized = JSON.stringify(result);
            const exposed = serialized.includes(privateCommunity) || serialized.includes(postIds.get("routing-private")!) || serialized.includes(privateMarker);
            if (exposed) forbiddenExposures++;
            expect(exposed).toBe(false); // Never print private fixture text on failure.
          }
          const retrieved = result.evidence.map(item => {
            const key = sourceKeys.get(item.sourceId);
            if (!key) throw new Error("Unexpected source outside evaluation corpus");
            return key;
          });
          const relevant = query.gold.filter(key => retrieved.includes(key));
          const supporting = query.gold.filter(key => result.evidence.some(item => sourceKeys.get(item.sourceId) === key && item.text.includes(supportingAnchors[key])));
          return { status: 200, retrieved, relevant, supporting, elapsedMs };
        } catch (error) {
          const status = error instanceof InputError ? 400 : error && typeof error === "object" && "status" in error ? error.status : undefined;
          if (status !== query.expectedStatus || (status !== 400 && status !== 404)) throw error;
          return { status, retrieved: [] as string[], relevant: [] as string[], supporting: [] as string[], elapsedMs: performance.now() - started };
        }
      }
      const warmup = await attempt(); warmupCalls++;
      expect(warmup.status).toBe(query.expectedStatus ?? 200);
      const timings: number[] = [];
      for (let sample = 0; sample < samplesPerQuery; sample++) {
        const current = await attempt(); measuredCalls++;
        expect(current.status).toBe(warmup.status); expect(current.retrieved).toEqual(warmup.retrieved);
        timings.push(current.elapsedMs); if (current.status === 200) successfulLatency.push(current.elapsedMs);
      }
      rows.push({ id: query.id, category: query.category, status: warmup.status, gold: query.gold, retrieved: warmup.retrieved,
        preparationChanged: experimenting && warmup.status !== 400 && prepareEvidenceQuery(parameters).get("q") !== parameters.get("q"),
        recallAt5: query.gold.length ? warmup.relevant.length / query.gold.length : null,
        topRelevant: query.gold.length ? query.gold.includes(warmup.retrieved[0]) : null,
        supportingPassageRecallAt5: query.gold.length ? warmup.supporting.length / query.gold.length : null,
        latencyMs: { samples: timings, p50: percentile(timings, 0.5), p95: percentile(timings, 0.95) } });
    }
    const answerable = rows.filter(row => row.recallAt5 !== null);
    const report = { corpusVersion, corpusSha256, applicationSha256, variant: experimenting ? "bounded-query-v1" : "baseline",
      environment: { node: process.version, postgres: (await migration.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version },
      dataset: { posts: corpusPosts.length, commentsAndReplies: corpusComments.length, queries: rows.length, answerableQueries: answerable.length },
      method: { samplesPerQuery, warmupCalls, measuredCalls, sequential: true, successfulLatencySamples: successfulLatency.length, revocationChecks },
      summary: { macroRecallAt5: mean(answerable.map(row => row.recallAt5!)), topResultRelevance: mean(answerable.map(row => Number(row.topRelevant))),
        supportingPassageRecallAt5: mean(answerable.map(row => row.supportingPassageRecallAt5!)), invalidQueries: rows.filter(row => row.status === 400).length,
        correctInsufficientEmpty: rows.find(row => row.id === "insufficient")?.retrieved.length === 0,
        privateFilterDenied: rows.find(row => row.id === "private-filter-denied")?.status === 404, forbiddenExposures,
        successfulLatencyMs: { p50: percentile(successfulLatency, 0.5), p95: percentile(successfulLatency, 0.95), max: Math.max(...successfulLatency) } }, rows };
    const comparisons = baseline ? rows.map((row, index) => {
      const before = baseline.rows[index];
      return { id: row.id, baselineStatus: before.status, experimentStatus: row.status,
        baselineRetrieved: before.retrieved, experimentRetrieved: row.retrieved,
        recallDelta: row.recallAt5 === null ? null : row.recallAt5 - before.recallAt5!,
        topRelevanceDelta: row.topRelevant === null ? null : Number(row.topRelevant) - Number(before.topRelevant),
        supportingPassageRecallDelta: row.supportingPassageRecallAt5 === null ? null : row.supportingPassageRecallAt5 - before.supportingPassageRecallAt5!,
        medianLatencyDeltaMs: row.latencyMs.p50! - before.latencyMs.p50,
        p95LatencyDeltaMs: row.latencyMs.p95! - before.latencyMs.p95 };
    }) : [];
    const comparison = baseline ? { baselineReportSha256: hash(baselineText!), baselineSummary: baseline.summary, cases: comparisons,
      qualityRegressions: comparisons.filter(row => (row.recallDelta ?? 0) < 0 || (row.topRelevanceDelta ?? 0) < 0 || (row.supportingPassageRecallDelta ?? 0) < 0).map(row => row.id),
      qualityImprovements: comparisons.filter(row => (row.recallDelta ?? 0) > 0 || (row.topRelevanceDelta ?? 0) > 0 || (row.supportingPassageRecallDelta ?? 0) > 0).map(row => row.id),
      slowerMedianCases: comparisons.filter(row => row.medianLatencyDeltaMs > 0).map(row => row.id) } : null;
    writeFileSync(experimenting ? ".cache/m5-query-experiment.json" : ".cache/m5-evidence-quality.json", JSON.stringify({ ...report, comparison }, null, 2));
    console.log(JSON.stringify({ evaluation: report.variant, dataset: report.dataset, summary: report.summary,
      qualityRegressions: comparison?.qualityRegressions }));
  }, 60000);
});
