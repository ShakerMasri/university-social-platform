import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { readArchiveSources, searchArchiveSources, type ArchiveSource } from "../archive/service";
import { CommunityError } from "../communities/service";
import { retrieveEvidence, revalidateEvidence } from "./service";

vi.mock("../archive/service.ts", () => ({ archiveSourceLimit: 5, readArchiveSources: vi.fn(), searchArchiveSources: vi.fn() }));
const db = {} as PrismaClient, token = "synthetic-session";
const communityId = "00000000-0000-4000-8000-000000000001", postId = "00000000-0000-4000-8000-000000000002";
const commentId = "00000000-0000-4000-8000-000000000003";
const source: ArchiveSource = { communityId, postId, commentId: null, rootId: null, title: "CE101 مؤشرات",
  body: "Pointer explanation", createdAt: new Date("2024-01-01T12:00:00Z"), postCreatedAt: new Date("2024-01-01T12:00:00Z") };
const query = () => new URLSearchParams({ q: "CE101 مؤشرات" });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(searchArchiveSources).mockResolvedValue({ sources: [source], interrupted: false }); vi.mocked(readArchiveSources).mockResolvedValue([source]); });

describe("evidence orchestration (mocked archive boundary, not PostgreSQL authorization proof)", () => {
  it("delegates the normalized query and returns minimal stable metadata", async () => {
    const result = await retrieveEvidence(db, token, query()), again = await retrieveEvidence(db, token, query());
    expect(searchArchiveSources).toHaveBeenCalledWith(db, token, expect.objectContaining({ terms: ["ce101", "مؤشرات"] }));
    expect(result).toEqual(again);
    expect(result.evidence[0]).toEqual({ sourceId: `post:${postId}`, citation: { communityId, postId, commentId: null },
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), kind: "post", title: source.title,
      text: `${source.title}\n${source.body}`, truncated: false, createdAt: source.createdAt.toISOString(), postCreatedAt: source.postCreatedAt.toISOString() });
    expect(JSON.stringify(result)).not.toMatch(/author|profile|notification|resourceUrl|token|email/i);
  });
  it.each([null, postId])("uses the actual comment timestamp and distinguishes roots/replies", async rootId => {
    vi.mocked(searchArchiveSources).mockResolvedValue({ sources: [{ ...source, commentId, rootId, createdAt: new Date("2026-11-01T12:00:00Z") }], interrupted: false });
    const { evidence } = await retrieveEvidence(db, token, query());
    expect(evidence[0].sourceId).toBe(`comment:${commentId}`); expect(evidence[0].kind).toBe(rootId ? "reply" : "comment");
    expect(evidence[0].text).toBe(source.body); expect(evidence[0].createdAt).toBe("2026-11-01T12:00:00.000Z");
    expect(evidence[0].postCreatedAt).toBe(source.postCreatedAt.toISOString()); expect(evidence[0].citation.commentId).toBe(commentId);
  });
  it("preserves empty/interrupted results without inventing evidence or counts", async () => {
    vi.mocked(searchArchiveSources).mockResolvedValue({ sources: [], interrupted: true });
    expect(await retrieveEvidence(db, token, query())).toEqual({ evidence: [], interrupted: true });
  });
  it("prefers a late matching body passage while retaining the title as context", async () => {
    const body = `${"Introduction ".repeat(200)}CE101 مؤشرات actual explanation`;
    vi.mocked(searchArchiveSources).mockResolvedValue({ sources: [{ ...source, body }], interrupted: false });
    const { evidence } = await retrieveEvidence(db, token, query());
    expect(evidence[0].title).toBe(source.title); expect(evidence[0].text).toContain("actual explanation");
    expect(body).toContain(evidence[0].text); expect(evidence[0].truncated).toBe(true);
  });
  it("rejects invalid queries before database work", async () => {
    await expect(retrieveEvidence(db, token, new URLSearchParams({ q: "", url: "https://evil.test" }))).rejects.toThrow();
    expect(searchArchiveSources).not.toHaveBeenCalled();
  });
  it("propagates denial, rate limits and unexpected failures without returning evidence", async () => {
    for (const error of [new CommunityError(401), new CommunityError(404), new CommunityError(429), new Error("Database unavailable")]) {
      vi.mocked(searchArchiveSources).mockRejectedValueOnce(error);
      await expect(retrieveEvidence(db, token, query())).rejects.toBe(error);
    }
  });
  it("re-reads all source targets and returns no cached content on success", async () => {
    const { evidence } = await retrieveEvidence(db, token, query());
    expect(await revalidateEvidence(db, token, evidence)).toBeUndefined();
    expect(readArchiveSources).toHaveBeenCalledWith(db, token, evidence.map(item => item.citation));
  });
  it.each(["body", "title", "createdAt", "postCreatedAt", "rootId"] as const)("rejects stale %s instead of blessing the old answer", async field => {
    const { evidence } = await retrieveEvidence(db, token, query());
    const updated = { ...source, [field]: field.endsWith("At") ? new Date("2026-01-01T00:00:00Z") : "changed" };
    vi.mocked(readArchiveSources).mockResolvedValue([updated]);
    await expect(revalidateEvidence(db, token, evidence)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects missing sources, denies revoked access, and propagates revalidation failures", async () => {
    const { evidence } = await retrieveEvidence(db, token, query());
    vi.mocked(readArchiveSources).mockResolvedValueOnce([]);
    await expect(revalidateEvidence(db, token, evidence)).rejects.toMatchObject({ status: 404 });
    const denial = new CommunityError(404); vi.mocked(readArchiveSources).mockRejectedValueOnce(denial);
    await expect(revalidateEvidence(db, token, evidence)).rejects.toBe(denial);
    const failure = new Error("Database unavailable"); vi.mocked(readArchiveSources).mockRejectedValueOnce(failure);
    await expect(revalidateEvidence(db, token, evidence)).rejects.toBe(failure);
  });
  it("rejects malformed, oversized or mismatched citation references before reading", async () => {
    for (const value of [null, Array(6).fill({}), [{ sourceId: `post:${postId}`, citation: { communityId, postId, commentId }, fingerprint: "a".repeat(64) }]]) {
      await expect(revalidateEvidence(db, token, value)).rejects.toThrow();
    }
    expect(readArchiveSources).not.toHaveBeenCalled();
  });
});
