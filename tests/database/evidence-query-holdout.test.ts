import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { newToken, digest } from "../../src/server/identity/policy";
import { validInput } from "../../src/server/communities/http";
import { changeMembership } from "../../src/server/communities/service";
import { retrieveEvidence, revalidateEvidence } from "../../src/server/evidence/service";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { prepareEvidenceQuery } from "../../tools/database/evidence-query-experiment";
import { prepareEvidenceQueryRevision } from "../../tools/database/evidence-query-revision";
import { holdoutAnchors, holdoutPosts, holdoutQueries, holdoutVersion } from "../evaluation/evidence-query-holdout";

const enabled = process.env.M5_QUERY_HOLDOUT_VALIDATION === "1", manifest = enabled ? readManifest() : null;
const name = process.env.M5_EVIDENCE_DATABASE;
if (enabled && !manifest?.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Fresh owned holdout target required");
const variants = ["baseline", "prepared", "revision"] as const;
type Variant = typeof variants[number];
type Outcome = { retrieved: string[]; recall: number | null; topRelevant: number | null; precision: number | null; support: number | null };
type MeasuredOutcome = Outcome & { latencyMs: { samples: number[]; p50: number; p95: number } };
type HoldoutRow = { id: string; category: string; gold: string[]; variants: Record<Variant, MeasuredOutcome> };
const fixedId = (index: number) => `00000000-0000-4000-b000-${String(index).padStart(12, "0")}`;
const publicCommunity = fixedId(1), privateCommunity = fixedId(2), publicProbe = fixedId(901), privateProbe = fixedId(902);
const ids = new Map(holdoutPosts.map((source, index) => [source.key, fixedId(100 + index)]));
const keys = new Map<string, string>([...ids].map(([key, id]) => [`post:${id}`, key] as const));
const privateMarker = "SYNTHETIC_PRIVATE_HOLDOUT_MARKER";
const sha = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;

describe.skipIf(!enabled)("M5-03B paired holdout validation on fresh PostgreSQL", () => {
  beforeAll(async () => {
    if (!manifest) throw new Error("Focused runner required");
    db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
    const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
    migration = new Client({ connectionString: url }); await migration.connect();
    if ((await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count !== 0) throw new Error("Holdout target must be empty; no clearing or adoption");
  });
  afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
  async function actor() {
    const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
    await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
    await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { id, token };
  }
  function parameters(variant: Variant, input: URLSearchParams) {
    return variant === "baseline" ? new URLSearchParams(input) : validInput(() => variant === "prepared" ? prepareEvidenceQuery(input) : prepareEvidenceQueryRevision(input));
  }

  it("compares all three variants with fixed labels and authorization probes on the SAME target", async () => {
    const frozenCorpus = sha(readFileSync("tests/evaluation/evidence-corpus.ts", "utf8"));
    const frozenReport = readFileSync(".cache/m5-query-baseline.json", "utf8");
    const baseline = JSON.parse(frozenReport) as { corpusSha256: string };
    expect(frozenCorpus).toBe(baseline.corpusSha256);
    const owner = await actor();
    for (const [id, visibility] of [[publicCommunity, "PUBLIC"], [privateCommunity, "PRIVATE"]]) {
      await migration.query('INSERT INTO "Community" (id,"ownerId",name,description,visibility) VALUES ($1,$2,\'Synthetic holdout\',\'\',$3::"CommunityVisibility")', [id, owner.id, visibility]);
      await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,\'MEMBER\')', [id, owner.id]);
    }
    for (const [index, source] of holdoutPosts.entries()) {
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"createdAt") VALUES ($1,$2,$3,\'DISCUSSION\',$4,$5,$6)',
        [ids.get(source.key), publicCommunity, owner.id, source.title, source.body, "newer" in source && source.newer ? `2026-11-${10 + index % 4}T12:00:00Z` : `2024-03-${String(index + 1).padStart(2, "0")}T12:00:00Z`]);
    }
    for (const [id, community, body] of [[publicProbe, publicCommunity, "SCOPE42 synthetic public evidence."], [privateProbe, privateCommunity, `SCOPE42 ${privateMarker} member evidence.`]]) {
      await migration.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) VALUES ($1,$2,$3,\'DISCUSSION\',\'ما معنى SCOPE42؟\',$4)', [id, community, owner.id, body]);
    }
    for (const query of holdoutQueries) for (const key of query.gold) expect(holdoutPosts.find(source => source.key === key)?.body.includes(holdoutAnchors[key])).toBe(true);

    let forbiddenExposures = 0;
    function assertNoPrivate(result: Awaited<ReturnType<typeof retrieveEvidence>>) {
      const text = JSON.stringify(result);
      const exposed = text.includes(privateCommunity) || text.includes(privateProbe) || text.includes(privateMarker);
      if (exposed) forbiddenExposures++;
      expect(exposed).toBe(false); // Do not print any private body/metadata.
    }
    const rows: HoldoutRow[] = [];
    const allLatencies: Record<Variant, number[]> = { baseline: [], prepared: [], revision: [] };
    for (const [caseIndex, query] of holdoutQueries.entries()) {
      const reader = await actor(), input = new URLSearchParams({ q: query.query });
      const outcomes = new Map<Variant, Outcome>();
      const timings: Record<Variant, number[]> = { baseline: [], prepared: [], revision: [] };
      const order = (round: number) => variants.map((_, offset) => variants[(caseIndex + round + offset) % variants.length]);
      async function attempt(variant: Variant) {
        const started = performance.now();
        const result = await retrieveEvidence(db, reader.token, parameters(variant, input));
        const elapsed = performance.now() - started;
        assertNoPrivate(result); expect(result.interrupted).toBe(false); expect(result.evidence.length).toBeLessThanOrEqual(5);
        const retrieved = result.evidence.map(source => {
          const key = keys.get(source.sourceId); if (!key) throw new Error("Unexpected holdout source"); return key;
        });
        const relevant = query.gold.filter(key => retrieved.includes(key));
        const support = query.gold.filter(key => result.evidence.some(source => keys.get(source.sourceId) === key && source.text.includes(holdoutAnchors[key])));
        return { elapsed, outcome: { retrieved, recall: query.gold.length ? relevant.length / query.gold.length : null,
          topRelevant: query.gold.length ? Number(query.gold.includes(retrieved[0])) : null,
          precision: query.gold.length ? (retrieved.length ? relevant.length / retrieved.length : 0) : null,
          support: query.gold.length ? support.length / query.gold.length : null } };
      }
      for (const variant of order(0)) outcomes.set(variant, (await attempt(variant)).outcome);
      // Balanced round-robin order on one database/actor; 18 retrievals per case
      // stay below the real 30-attempt cap. No reset, bypass or clock changes.
      for (let round = 0; round < 5; round++) for (const variant of order(round)) {
        const current = await attempt(variant); expect(current.outcome).toEqual(outcomes.get(variant));
        timings[variant].push(current.elapsed); allLatencies[variant].push(current.elapsed);
      }
      rows.push({ id: query.id, category: query.category, gold: query.gold,
        variants: Object.fromEntries(variants.map(variant => [variant, { ...outcomes.get(variant)!, latencyMs: { samples: timings[variant], p50: percentile(timings[variant], 0.5), p95: percentile(timings[variant], 0.95) } }])) as Record<Variant, MeasuredOutcome> });
    }

    let authorizationChecks = 0, revocationChecks = 0;
    for (const variant of variants) for (const state of ["outsider", "pending", "member", "revoked", "filtered"]) {
      const reader = await actor();
      if (["pending", "member", "revoked"].includes(state)) await migration.query('INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,$3::"MembershipStatus")', [privateCommunity, reader.id, state === "pending" ? "PENDING" : "MEMBER"]);
      const input = new URLSearchParams({ q: "ما معنى SCOPE42؟", ...(state === "filtered" ? { community: privateCommunity } : {}) });
      const retrieve = () => retrieveEvidence(db, reader.token, parameters(variant, input));
      if (state === "revoked") {
        const before = await retrieve(); expect(before.evidence.some(source => source.citation.postId === privateProbe)).toBe(true);
        await changeMembership(db, owner.token, privateCommunity, { action: "remove", userId: reader.id });
        await expect(revalidateEvidence(db, reader.token, before.evidence)).rejects.toMatchObject({ status: 404 }); revocationChecks++;
      }
      if (state === "filtered") await expect(retrieve()).rejects.toMatchObject({ status: 404 });
      else {
        const result = await retrieve(); if (state !== "member") assertNoPrivate(result);
        const actual = result.evidence.map(source => source.citation.postId).sort();
        const expected = (state === "member" ? [publicProbe, privateProbe] : [publicProbe]).sort();
        expect(JSON.stringify(actual) === JSON.stringify(expected)).toBe(true);
      }
      authorizationChecks++;
    }
    const summary = Object.fromEntries(variants.map(variant => {
      const positive = rows.filter(row => row.gold.length).map(row => row.variants[variant]);
      const regressions = rows.filter(row => {
        const before = row.variants.baseline, after = row.variants[variant];
        return (after.recall ?? 0) < (before.recall ?? 0) || (after.topRelevant ?? 0) < (before.topRelevant ?? 0) ||
          (after.support ?? 0) < (before.support ?? 0) || (after.precision ?? 0) < (before.precision ?? 0) ||
          (!row.gold.length && after.retrieved.length > before.retrieved.length);
      }).map(row => row.id);
      return [variant, { recallAt5: average(positive.map(row => row.recall!)), topRelevance: average(positive.map(row => row.topRelevant!)),
        supportingPassageRecall: average(positive.map(row => row.support!)), resultPrecision: average(positive.map(row => row.precision!)),
        regressions, emptyNegativeCases: rows.filter(row => !row.gold.length && !row.variants[variant].retrieved.length).length,
        latencyMs: { p50: percentile(allLatencies[variant], 0.5), p95: percentile(allLatencies[variant], 0.95) } }];
    }));
    writeFileSync(".cache/m5-query-holdout.json", JSON.stringify({ holdoutVersion, holdoutSha256: sha(readFileSync("tests/evaluation/evidence-query-holdout.ts", "utf8")),
      frozenCorpusSha256: frozenCorpus, frozenBaselineSha256: sha(frozenReport),
      method: { posts: holdoutPosts.length, queries: rows.length, answerable: rows.filter(row => row.gold.length).length, variants: variants.length,
        warmups: rows.length * variants.length, measured: rows.length * variants.length * 5, sameTarget: true, balancedRoundRobin: true },
      authorizationChecks, revocationChecks, forbiddenExposures, summary, rows }, null, 2));
  }, 60000);
});
