import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorized, reserveAttempt } from "../communities/service";
import { archiveInput } from "./policy";
import { readArchiveSources, searchArchiveSources, type ArchiveSource } from "./service";

vi.mock("../communities/service.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../communities/service.ts")>(), authorized: vi.fn(), reserveAttempt: vi.fn(),
}));
const query = vi.fn(), tx = { $queryRaw: query } as unknown as Prisma.TransactionClient, db = {} as PrismaClient;
const viewer = "00000000-0000-4000-8000-000000000001", first = "00000000-0000-4000-8000-000000000002";
const second = "00000000-0000-4000-8000-000000000003", postId = "00000000-0000-4000-8000-000000000004";
const row: ArchiveSource = { communityId: first, postId, commentId: null, rootId: null, title: "Evidence", body: "Text",
  createdAt: new Date("2024-01-01T00:00:00Z"), postCreatedAt: new Date("2024-01-01T00:00:00Z") };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authorized).mockImplementation((_db, _token, run) => run(tx, viewer));
  vi.mocked(reserveAttempt).mockResolvedValue(undefined);
});

describe("evidence SQL construction (mocked transaction, not database execution)", () => {
  it("binds terms and viewer permissions before projecting sources and excludes unrelated tables", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: postId, communityId: first, createdAt: row.createdAt }]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    const input = archiveInput(new URLSearchParams({ q: "select' مؤشرات" }));
    expect(await searchArchiveSources(db, "session", input)).toEqual({ sources: [row], interrupted: false });
    const projection = query.mock.calls.at(-1)![0] as Prisma.Sql;
    expect(projection.sql).toContain("c.visibility = 'PUBLIC'"); expect(projection.sql).toContain('c."ownerId"');
    expect(projection.sql).toContain("m.status = 'MEMBER'"); expect(projection.sql).toContain("AND NOT");
    expect(projection.sql).not.toContain("select'"); expect(projection.values).toContain("select'"); expect(projection.values).toContain(viewer);
    expect(projection.sql).not.toMatch(/Profile|DirectMessage|DirectConversation|Notification|resourceUrl/);
    expect(reserveAttempt).toHaveBeenCalledWith(db, "session", "m5-evidence-retrieval");
  });
  it("projects at most five selected parent IDs and preserves interruption without refilling", async () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`, communityId: first, createdAt: row.createdAt }));
    query.mockResolvedValueOnce([]).mockResolvedValueOnce(candidates).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await searchArchiveSources(db, "session", archiveInput(new URLSearchParams({ q: "evidence" })))).toEqual({ sources: [], interrupted: true });
    const projection = query.mock.calls.at(-1)![0] as Prisma.Sql;
    for (const candidate of candidates.slice(0, 5)) expect(projection.values).toContain(candidate.id);
    for (const candidate of candidates.slice(5)) expect(projection.values).not.toContain(candidate.id);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it("locks all revalidation communities in sorted order and binds parent/comment targets", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row, communityId: second }]).mockResolvedValueOnce([row]);
    const targets = [{ communityId: second, postId, commentId: viewer }, { communityId: first, postId, commentId: null }];
    await readArchiveSources(db, "session", targets);
    expect(query.mock.calls[1][1]).toBe(first); expect(query.mock.calls[2][1]).toBe(second);
    const projection = query.mock.calls[3][0] as Prisma.Sql;
    expect(projection.sql).toContain('hit."postId" = p.id'); expect(projection.sql).toContain("hit.id IS NOT NULL");
    expect(projection.sql).toContain("m.status = 'MEMBER'"); expect(projection.values).toContain(viewer); expect(projection.values).toContain(postId);
    expect(projection.sql).not.toMatch(/Profile|DirectMessage|Notification/);
    expect(reserveAttempt).toHaveBeenCalledWith(db, "session", "m5-evidence-revalidation");
  });
  it("fails the entire revalidation batch on an unavailable source", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    await expect(readArchiveSources(db, "session", [row, { ...row, postId: second }])).rejects.toMatchObject({ status: 404 });
  });
  it("does not query content for empty retrievals or oversized revalidation batches", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await searchArchiveSources(db, "session", archiveInput(new URLSearchParams({ q: "nothing" })))).toEqual({ sources: [], interrupted: false });
    expect(query).toHaveBeenCalledTimes(2);
    query.mockClear(); await expect(readArchiveSources(db, "session", Array(6).fill(row))).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
