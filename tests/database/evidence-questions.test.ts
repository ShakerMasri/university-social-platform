import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createLocalDatabase } from "../../src/server/database/client";
import { digest, newToken } from "../../src/server/identity/policy";
import { logout } from "../../src/server/identity/service";
import { createCommunity, changeMembership } from "../../src/server/communities/service";
import { InputError } from "../../src/server/communities/http";
import { createPost } from "../../src/server/posts/service";
import { createComment } from "../../src/server/comments/service";
import { archiveInput } from "../../src/server/archive/policy";
import { searchArchive } from "../../src/server/archive/service";
import { evidenceCitationPath } from "../../src/server/evidence/policy";
import { retrieveEvidence, revalidateEvidence } from "../../src/server/evidence/service";
import { retrievePreparedQuestionEvidence } from "../../src/server/evidence/questions";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";

// Only maintained fresh allocations: focused M5 target or the full runner's
// archive target. Never manually supply a retained target to bypass allocation.
const manifest = readManifest(), name = process.env.M5_EVIDENCE_DATABASE ?? process.env.M4_ARCHIVE_DATABASE;
if (!manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Owned disposable question target required");
let db: Awaited<ReturnType<typeof createLocalDatabase>>, migration: Client;
beforeAll(async () => {
  db = await createLocalDatabase(databaseUrl(manifest, name!, "runtime"));
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  migration = new Client({ connectionString: url }); await migration.connect();
  if (process.env.M5_EVIDENCE_DATABASE && (await migration.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count !== 0) throw new Error("Focused question target must be fresh; no clearing/adoption");
});
afterAll(async () => { await db?.$disconnect(); await migration?.end(); });
async function actor(profile = true) {
  const id = randomUUID(), token = newToken(), email = `${id}@university.test`;
  await migration.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
  if (profile) await db.profile.create({ data: { userId: id, displayName: "Synthetic دارس" } });
  await db.session.create({ data: { userId: id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, token };
}
const space = (owner: { token: string }, visibility = "PUBLIC") => createCommunity(db, owner.token, { name: `Questions ${randomUUID()}`, description: "", visibility });
const post = (owner: { token: string }, community: string, title: string, body: string, type = "DISCUSSION") => createPost(db, owner.token, community, { requestId: randomUUID(), type, title, body });
const query = (q: string, community?: string, type?: string) => new URLSearchParams({ q, ...(community ? { community } : {}), ...(type ? { type } : {}) });
const prepared = (user: { token: string }, q: string, community?: string, type?: string) => retrievePreparedQuestionEvidence(db, user.token, query(q, community, type));

describe("M5-03C prepared-question production entry on disposable PostgreSQL", () => {
  it("retrieves EN/AR and C++ evidence through explicit preparation while raw/archive contracts and filters stay unchanged", async () => {
    const owner = await actor(), reader = await actor(false), community = await space(owner);
    const english = await post(owner, community.id, "Name lookup", "DNS records work by mapping names to IP addresses.");
    const arabic = await post(owner, community.id, "التشفير", "التشفير يستخدم مفتاحا لحماية البيانات.");
    const cpp = await post(owner, community.id, "C++ exercises", "C++ keeps technical punctuation intact.");
    await post(owner, community.id, "C exercises", "C code examples.");
    await post(owner, community.id, "Another DNS thread", "DNS records work in this example.", "QUESTION");
    const original = query("How do DNS records work?", community.id, "DISCUSSION");
    expect((await retrieveEvidence(db, reader.token, original)).evidence).toEqual([]);
    expect((await searchArchive(db, reader.token, archiveInput(original), "a".repeat(64))).items).toEqual([]);
    const result = await retrievePreparedQuestionEvidence(db, reader.token, original);
    expect(original.get("q")).toBe("How do DNS records work?");
    expect(result.evidence.map(row => row.sourceId)).toEqual([`post:${english.id}`]);
    expect(result).toEqual(await retrieveEvidence(db, reader.token, query("DNS records work", community.id, "DISCUSSION")));
    expect((await prepared(reader, "ما معنى التشفير؟", community.id)).evidence[0].sourceId).toBe(`post:${arabic.id}`);
    expect((await prepared(reader, "What is C++?", community.id)).evidence.map(row => row.sourceId)).toEqual([`post:${cpp.id}`]);
    await expect(revalidateEvidence(db, reader.token, result.evidence)).resolves.toBeUndefined();
  });
  it("retains negation and uncertain wording instead of admitting contrary substring matches", async () => {
    const owner = await actor(), community = await space(owner);
    const english = await post(owner, community.id, "Why is TLS not obsolete?", "TLS is not obsolete under the synthetic exercise assumptions.");
    await post(owner, community.id, "Contrary TLS exercise", "TLS is obsolete; notification text accompanies this contrary claim.");
    const arabic = await post(owner, community.id, "لماذا لا يحذف SELECT البيانات؟", "SELECT لا يحذف البيانات في هذا المثال.");
    await post(owner, community.id, "افتراض معاكس", "SELECT يحذف البيانات في افتراض خلاف المثال.");
    await post(owner, community.id, "زمن الاستجابة", "زمن الاستجابة هو وقت الرد.");
    expect((await prepared(owner, "Why is TLS not obsolete?", community.id)).evidence.map(row => row.sourceId)).toEqual([`post:${english.id}`]);
    expect((await prepared(owner, "لماذا لا يحذف SELECT البيانات؟", community.id)).evidence.map(row => row.sourceId)).toEqual([`post:${arabic.id}`]);
    expect((await prepared(owner, "ما معنى من؟", community.id)).evidence).toEqual([]);
  });
  it("enforces private reply permissions, citation-parent checks, membership removal and logout", async () => {
    const owner = await actor(), reader = await actor(false), outsider = await actor(false), community = await space(owner, "PRIVATE");
    const parent = await post(owner, community.id, "Network thread", "General synthetic context.");
    const root = await createComment(db, owner.token, community.id, parent.id, { requestId: randomUUID(), body: "Discussion root" });
    const reply = await createComment(db, owner.token, community.id, parent.id, { requestId: randomUUID(), body: "DHCP42 PRIVATE QUESTION SENTINEL assigns addresses.", replyToId: root.id });
    expect((await prepared(reader, "What is DHCP42?")).evidence).toEqual([]);
    await changeMembership(db, reader.token, community.id, { action: "join" });
    expect((await prepared(reader, "What is DHCP42?")).evidence).toEqual([]);
    await expect(prepared(reader, "What is DHCP42?", community.id)).rejects.toMatchObject({ status: 404 });
    await changeMembership(db, owner.token, community.id, { action: "approve", userId: reader.id });
    const result = await prepared(reader, "What is DHCP42?", community.id);
    expect(result.evidence).toHaveLength(1); expect(result.evidence[0].kind).toBe("reply");
    expect(result.evidence[0].citation).toEqual({ communityId: community.id, postId: parent.id, commentId: reply.id });
    expect(evidenceCitationPath(result.evidence[0].citation, "ar")).toBe(`/ar/communities/${community.id}/posts/${parent.id}?comment=${reply.id}`);
    await expect(revalidateEvidence(db, reader.token, result.evidence)).resolves.toBeUndefined();
    await expect(revalidateEvidence(db, outsider.token, result.evidence)).rejects.toMatchObject({ status: 404 });
    await expect(revalidateEvidence(db, reader.token, [{ ...result.evidence[0], citation: { ...result.evidence[0].citation, postId: randomUUID() } }])).rejects.toMatchObject({ status: 404 });
    await changeMembership(db, owner.token, community.id, { action: "remove", userId: reader.id });
    const denied = await prepared(reader, "What is DHCP42?");
    expect(denied.evidence).toEqual([]); expect(JSON.stringify(denied).includes("PRIVATE QUESTION SENTINEL")).toBe(false);
    await expect(revalidateEvidence(db, reader.token, result.evidence)).rejects.toMatchObject({ status: 404 });
    await logout(db, reader.token); await expect(prepared(reader, "What is DHCP42?")).rejects.toMatchObject({ status: 401 });
  });
  it("rejects stale prepared-source citations and returns freshly read text", async () => {
    const owner = await actor(), community = await space(owner);
    const source = await post(owner, community.id, "Editable fixture", "DNS42 original explanation.");
    const before = await prepared(owner, "What is DNS42?", community.id);
    // Fixture-only update on this disposable target; no editing product flow.
    await migration.query('UPDATE "Post" SET body=$1 WHERE id=$2', ["DNS42 updated explanation.", source.id]);
    await expect(revalidateEvidence(db, owner.token, before.evidence)).rejects.toMatchObject({ status: 404 });
    const after = await prepared(owner, "What is DNS42?", community.id);
    expect(after.evidence[0].text).toContain("updated explanation");
    expect(after.evidence[0].fingerprint).not.toBe(before.evidence[0].fingerprint);
    await expect(revalidateEvidence(db, owner.token, after.evidence)).resolves.toBeUndefined();
  });
  it("rejects oversized original questions before writes and shares the raw durable attempt budget", async () => {
    const reader = await actor(false), budget = digest(`m5-evidence-retrieval:${reader.id}`);
    for (const q of ["How can I prevent race conditions in shared memory programs?", "x".repeat(201)]) await expect(prepared(reader, q)).rejects.toBeInstanceOf(InputError);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: budget } })).toBeNull();
    const unknown = randomUUID();
    for (let i = 0; i < 30; i++) await expect(prepared(reader, "What is DNS42?", unknown)).rejects.toMatchObject({ status: 404 });
    await expect(prepared(reader, "What is DNS42?", unknown)).rejects.toMatchObject({ status: 429 });
    await expect(retrieveEvidence(db, reader.token, query("DNS42"))).rejects.toMatchObject({ status: 429 });
    expect((await db.identityRateLimit.findUniqueOrThrow({ where: { keyDigest: budget } })).hits).toBe(30);
    expect(await db.identityRateLimit.findUnique({ where: { keyDigest: digest(`m4-archive-search:${reader.id}`) } })).toBeNull();
  });
});
