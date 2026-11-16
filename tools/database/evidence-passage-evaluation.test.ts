import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { evidenceInput, evidencePassage, evidenceTextLimit } from "../../src/server/evidence/policy";
import { selectEvidencePassages, passageGapMarker } from "./evidence-passage-experiment";
import { passageCases, passageCorpusVersion } from "../../tests/evaluation/evidence-passage-corpus";

const variants = ["baseline", "experiment"] as const;
type Variant = typeof variants[number];
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const hash = (value: string) => createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
const enabled = process.env.M5_PASSAGE_EVALUATION === "1";

describe.skipIf(!enabled)("M5-04C frozen passage-only quality and helper latency", () => {
  it("compares both variants in balanced order without database or provider calls", () => {
    const registrationText = readFileSync("tests/evaluation/evidence-passage-registration.json", "utf8");
    const registration = JSON.parse(registrationText) as { hashes: Record<string, string> };
    for (const [path, expected] of Object.entries(registration.hashes)) expect(hash(readFileSync(path, "utf8"))).toBe(expected);
    expect(passageCases).toHaveLength(12);
    const allLatency: Record<Variant, number[]> = { baseline: [], experiment: [] };
    const samplesPerCaseVariant = 15, callsPerSample = 3;
    const rows = passageCases.map((row, caseIndex) => {
      const terms = evidenceInput(new URLSearchParams({ q: row.query })).terms;
      const call = (variant: Variant) => variant === "baseline" ? evidencePassage(row.text, terms) : selectEvidencePassages(row.text, terms);
      const order = (round: number) => (caseIndex + round) % 2 ? [...variants].reverse() : [...variants];
      const outcomes = { baseline: evidencePassage(row.text, terms), experiment: selectEvidencePassages(row.text, terms) };
      // One warmup per variant, then balanced batches. Time only helper calls;
      // assertions, file I/O and query parsing are outside measurements.
      for (const variant of order(0)) call(variant);
      const timings: Record<Variant, number[]> = { baseline: [], experiment: [] };
      for (let round = 0; round < samplesPerCaseVariant; round++) for (const variant of order(round)) {
        const started = performance.now(); let current = outcomes[variant];
        for (let repetition = 0; repetition < callsPerSample; repetition++) current = call(variant);
        const elapsed = (performance.now() - started) / callsPerSample;
        expect(current).toEqual(outcomes[variant]); timings[variant].push(elapsed); allLatency[variant].push(elapsed);
      }
      for (const anchor of row.anchors) expect(row.text).toContain(anchor);
      const experiment = outcomes.experiment, points = Array.from(row.text);
      expect(experiment.segments.length).toBeLessThanOrEqual(2);
      for (const segment of experiment.segments) expect(segment.text).toBe(points.slice(segment.start, segment.end).join(""));
      if (experiment.segments.length === 2) {
        expect(experiment.segments[0].end).toBeLessThan(experiment.segments[1].start);
        expect(experiment.text).toBe(experiment.segments.map(segment => segment.text).join(passageGapMarker));
      }
      const included = experiment.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
      expect(experiment.omittedCodePoints).toBe(points.length - included); expect(experiment.truncated).toBe(included < points.length);
      for (const variant of variants) expect(Array.from(outcomes[variant].text).length).toBeLessThanOrEqual(evidenceTextLimit);
      const quality = {
        baseline: row.anchors.filter(anchor => outcomes.baseline.text.includes(anchor)).length / row.anchors.length,
        // An anchor must be wholly inside ONE contiguous original segment.
        experiment: row.anchors.filter(anchor => experiment.segments.some(segment => segment.text.includes(anchor))).length / row.anchors.length,
      };
      return { id: row.id, anchors: row.anchors.length, variants: Object.fromEntries(variants.map(variant => [variant, {
        supportingAnchorRecall: quality[variant], renderedCodePoints: Array.from(outcomes[variant].text).length,
        quotedCodePoints: variant === "baseline" ? Array.from(outcomes.baseline.text).length : included,
        truncated: outcomes[variant].truncated, segmentCount: variant === "baseline" ? 1 : experiment.segments.length,
        latencyMs: { samples: timings[variant], p50: percentile(timings[variant], 0.5), p95: percentile(timings[variant], 0.95) },
      }])) as Record<Variant, { supportingAnchorRecall: number; renderedCodePoints: number; quotedCodePoints: number; truncated: boolean; segmentCount: number; latencyMs: { samples: number[]; p50: number; p95: number } }>,
        experimentalRanges: experiment.segments.map(({ start, end }) => ({ start, end })) };
    });
    const comparisons = rows.map(row => ({ id: row.id, anchorRecallDelta: row.variants.experiment.supportingAnchorRecall - row.variants.baseline.supportingAnchorRecall,
      renderedLengthDelta: row.variants.experiment.renderedCodePoints - row.variants.baseline.renderedCodePoints,
      medianLatencyDeltaMs: row.variants.experiment.latencyMs.p50 - row.variants.baseline.latencyMs.p50,
      p95LatencyDeltaMs: row.variants.experiment.latencyMs.p95 - row.variants.baseline.latencyMs.p95 }));
    const summary = Object.fromEntries(variants.map(variant => [variant, {
      macroSupportingAnchorRecall: average(rows.map(row => row.variants[variant].supportingAnchorRecall)),
      averageRenderedCodePoints: average(rows.map(row => row.variants[variant].renderedCodePoints)),
      averageQuotedCodePoints: average(rows.map(row => row.variants[variant].quotedCodePoints)),
      maximumRenderedCodePoints: Math.max(...rows.map(row => row.variants[variant].renderedCodePoints)),
      splitCases: rows.filter(row => row.variants[variant].segmentCount === 2).length,
      latencyMs: { samples: allLatency[variant].length, p50: percentile(allLatency[variant], 0.5), p95: percentile(allLatency[variant], 0.95), max: Math.max(...allLatency[variant]) },
    }]));
    mkdirSync(".cache/m5-04c", { recursive: true });
    writeFileSync(".cache/m5-04c/results.json", JSON.stringify({ passageCorpusVersion, registrationSha256: hash(registrationText),
      method: { cases: rows.length, samplesPerCaseVariant, callsPerSample, latencySamplesPerVariant: rows.length * samplesPerCaseVariant,
        timedCalls: rows.length * variants.length * samplesPerCaseVariant * callsPerSample, warmups: rows.length * variants.length,
        initialOutcomeCalls: rows.length * variants.length, balancedOrder: true, latencyScope: "helper CPU/wall time; no DB, retrieval or provider", codePointLimit: evidenceTextLimit },
      summary, regressions: comparisons.filter(row => row.anchorRecallDelta < 0).map(row => row.id), comparisons, rows }, null, 2));
  }, 60000);
});
