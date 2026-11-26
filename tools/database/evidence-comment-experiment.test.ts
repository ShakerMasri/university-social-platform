import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { authorized, reserveAttempt } from "../../src/server/communities/service";
import { lockedArchiveCandidates, type ArchiveSource } from "../../src/server/archive/service";
import { projectEvidenceSource } from "../../src/server/evidence/service";
import { retrieveCommentEvidence } from "./evidence-comment-experiment";

vi.mock("../../src/server/communities/service.ts", async original => ({
  ...await original<typeof import("../../src/server/communities/service.ts")>(), authorized: vi.fn(), reserveAttempt: vi.fn(),
}));
vi.mock("../../src/server/archive/service.ts", async original => ({
  ...await original<typeof import("../../src/server/archive/service.ts")>(), lockedArchiveCandidates: vi.fn(),
}));
const query = vi.fn(), tx = { $queryRaw: query } as unknown as Prisma.TransactionClient, db = {} as PrismaClient;
const viewer = "00000000-0000-4000-a000-000000000001", communityId = "00000000-0000-4000-a000-000000000002";
const postId = "00000000-0000-4000-a000-000000000003";
const source: ArchiveSource = { communityId, postId, commentId: viewer, rootId: postId, title: "Synthetic exercise", body: "C++ owns references.",
  createdAt: new Date("2026-11-01"), postCreatedAt: new Date("2024-01-01") };
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(authorized).mockImplementation((_db, _token, run) => run(tx, viewer));
  vi.mocked(reserveAttempt).mockResolvedValue(undefined);
  vi.mocked(lockedArchiveCandidates).mockResolvedValue([{ id: postId, communityId, createdAt: source.postCreatedAt }]); query.mockResolvedValue([source]);
});
describe("M5-04B selection wiring (mocked; real permissions require PostgreSQL)", () => {
  it("reuses canonical candidate/access/projection policies with bound query values", async () => {
    const result = await retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "C++" }));
    expect(lockedArchiveCandidates).toHaveBeenCalledWith(tx, viewer, expect.objectContaining({ terms: ["c++"] }), "");
    expect(reserveAttempt).toHaveBeenCalledWith(db, "session", "m5-evidence-retrieval");
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("p.type = 'QUESTION' OR NOT"); expect(sql.sql).toContain("m.status = 'MEMBER'");
    expect(sql.sql).toContain('c."ownerId"'); expect(sql.sql).toContain('ORDER BY x."createdAt", x.id LIMIT 1');
    expect(sql.values).toContain("c++"); expect(sql.values).toContain(viewer); expect(sql.sql).not.toContain("c++");
    expect(sql.sql).not.toMatch(/DirectMessage|Profile|Notification|resourceUrl/);
    expect(result).toEqual({ evidence: [projectEvidenceSource(source, ["c++"])], interrupted: false });
  });
  it("bounds projection to five parents without refilling missing sources", async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: `00000000-0000-4000-a000-${String(100 + i).padStart(12, "0")}`, communityId, createdAt: source.postCreatedAt }));
    vi.mocked(lockedArchiveCandidates).mockResolvedValue(rows); query.mockResolvedValue([]);
    expect(await retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "C++" }))).toEqual({ evidence: [], interrupted: true });
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    for (const row of rows.slice(0, 5)) expect(sql.values).toContain(row.id);
    for (const row of rows.slice(5)) expect(sql.values).not.toContain(row.id);
  });
  it("does not project empty candidate sets", async () => {
    vi.mocked(lockedArchiveCandidates).mockResolvedValue([]);
    expect(await retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "C++" }))).toEqual({ evidence: [], interrupted: false }); expect(query).not.toHaveBeenCalled();
  });
  it("propagates authorization and query failures", async () => {
    const failure = new Error("Synthetic boundary failure"); vi.mocked(lockedArchiveCandidates).mockRejectedValueOnce(failure);
    await expect(retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "C++" }))).rejects.toBe(failure); expect(query).not.toHaveBeenCalled();
    query.mockRejectedValueOnce(failure); await expect(retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "C++" }))).rejects.toBe(failure);
  });
  it("rejects original input violations before reserving attempts or reading", async () => {
    await expect(retrieveCommentEvidence(db, "session", new URLSearchParams({ q: "x".repeat(201) }))).rejects.toThrow();
    expect(reserveAttempt).not.toHaveBeenCalled(); expect(lockedArchiveCandidates).not.toHaveBeenCalled();
  });
});
