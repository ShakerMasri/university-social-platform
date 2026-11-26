import { manualDatabase, type ManualFixtureTarget } from "./manual-fixtures.mts";
import { assertFeedQaEngine, assertFeedQaGuest } from "./feed-qa-guest.mts";
import { assertFeedQaWindows, assertWindowsFeedQaManifest } from "./feed-qa-windows.mts";
import { readManifest } from "../database/targets.ts";
import { eligibleEmail, syntheticDomain } from "../../src/server/identity/policy.ts";
import { validateDisplayName } from "../../src/server/database/validation.ts";

export const feedFixtureVersion = "m4-f02-manual-v1";
const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
export const feedQaAccounts = [
  { alias: "O", email: "feed-qa-owner@university.test", name: "Owner جامعة", id: uuid(100), directory: uuid(200) },
  { alias: "R", email: "feed-qa-reader@university.test", name: "Reader CE101", id: uuid(101), directory: uuid(201) },
  { alias: "N", email: "feed-qa-new@university.test", name: null, id: uuid(102), directory: null },
  { alias: "L", email: "feed-qa-limit@university.test", name: null, id: uuid(103), directory: null },
] as const;
const [owner, reader] = feedQaAccounts;
export const feedQaCommunities = [
  { code: "J", id: uuid(301), name: "QA Joined CE101 مجتمع", visibility: "PUBLIC" },
  { code: "P", id: uuid(302), name: "QA Private CE102 مجتمع", visibility: "PRIVATE" },
  { code: "D", id: uuid(303), name: "QA Discovery CE103 استكشاف", visibility: "PUBLIC" },
  { code: "H", id: uuid(304), name: "QA Unrelated CE104 خاص", visibility: "PRIVATE" },
] as const;
type Community = typeof feedQaCommunities[number]["code"];
export const feedQaMemberships = [
  ...feedQaCommunities.map(community => ({ account: "O", community: community.code })),
  { account: "R", community: "J" }, { account: "R", community: "P" },
] as const;
const sequential = (prefix: string, count: number, first = 1) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index + first).padStart(2, "0")}`);
const descriptions: Record<string, string> = {
  J01: "CE101 مؤشرات",
  J02: "Discussion about synchronization",
  J03: "Resource CE101 دليل",
  J04: "Announcement مواعيد",
  H01: "QA private sentinel",
};
const types = { J02: "DISCUSSION", J03: "RESOURCE", J04: "ANNOUNCEMENT" } as const;
function post(code: string, createdAt: string, suffix: number) {
  return {
    code, createdAt, id: uuid(suffix), community: code[0] as Community,
    author: code === "J21" ? "R" : "O",
    title: `${code} ${descriptions[code] ?? "Synthetic study example"}`,
    type: types[code as keyof typeof types] ?? "QUESTION",
    body: code === "P01" ? "CE102 خطوات المراجعة · R2-D2" : "Synthetic study example. مثال دراسي اصطناعي",
    resource: code === "J03" ? "https://example.invalid/CE101/very-long-reference-identifier-CE101-CE101-CE101" : null,
  };
}
export const feedQaPosts = [
  ...sequential("J", 18).map((code, index) => post(code,
    new Date(Date.UTC(2026, 10, 11, 12) - index * 60000).toISOString(), 1000 + index)),
  post("J19", "2026-11-10T11:00:00.000Z", 1019),
  post("J20", "2026-11-10T12:00:00.000Z", 20),
  post("J21", "2026-11-06T12:00:00.000Z", 1021),
  post("P01", "2026-11-10T10:00:00.000Z", 1101),
  post("P02", "2026-11-10T09:00:00.000Z", 1102),
  post("D01", "2026-11-13T12:00:00.001Z", 1201),
  post("D02", "2026-11-13T12:00:00.000Z", 30),
  post("D03", "2026-11-13T12:00:00.000Z", 10),
  post("D04", "2026-11-13T11:59:59.999Z", 1204),
  post("D05", "2026-11-13T08:00:00.000Z", 1205),
  post("D06", "2026-11-12T18:00:00.000Z", 1206),
  post("D07", "2026-11-10T13:00:00.000Z", 1207),
  post("H01", "2026-11-18T00:00:00.000Z", 1301),
];
// Fixed expected sequences are independent of the implementation under test.
export const feedQaExpected = {
  readerForYou: [[...sequential("J", 18), "D01", "D02"],
    ["J20", "D03", "D04", "J19", "P01", "P02", "D05", "D06", "D07", "J21"]],
  readerCommunities: [[...sequential("J", 18), "J20", "J19"], ["P01", "P02", "J21"]],
  newcomerForYou: [[...sequential("D", 6), ...sequential("J", 14)],
    [...sequential("J", 4, 15), "D07", "J20", "J19", "J21"]],
  newcomerCommunities: [[]],
};

export async function seedFeedQaFixture(target: ManualFixtureTarget) {
  assertFeedQaGuest();
  assertFeedQaEngine(readManifest());
  return seedOwnedFeedQaFixture(target);
}

export async function seedWindowsFeedQaFixture(target: ManualFixtureTarget, snapshot: string) {
  assertFeedQaWindows();
  assertWindowsFeedQaManifest(readManifest(), snapshot);
  return seedOwnedFeedQaFixture(target);
}

async function seedOwnedFeedQaFixture(target: ManualFixtureTarget) {
  const client = await manualDatabase(target);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`feed-qa:${target.sessionId}`]);
    const result = await client.query<{ populated: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM "User") OR EXISTS(SELECT 1 FROM "Profile") OR
      EXISTS(SELECT 1 FROM "EmailOwnershipChallenge") OR EXISTS(SELECT 1 FROM "Session") OR
      EXISTS(SELECT 1 FROM "IdentityRateLimit") OR EXISTS(SELECT 1 FROM "Community") OR
      EXISTS(SELECT 1 FROM "CommunityMembership") OR EXISTS(SELECT 1 FROM "Post") OR
      EXISTS(SELECT 1 FROM "Comment") OR EXISTS(SELECT 1 FROM "PostVote") OR
      EXISTS(SELECT 1 FROM "CommentVote") OR EXISTS(SELECT 1 FROM "Notification") OR
      EXISTS(SELECT 1 FROM "NotificationPreference") OR EXISTS(SELECT 1 FROM "DirectConversation") OR
      EXISTS(SELECT 1 FROM "DirectMessage") AS populated`);
    if (result.rows[0]?.populated !== false) throw new Error("Feed QA target must be empty");
    for (const account of feedQaAccounts) {
      const address = eligibleEmail(account.email, [syntheticDomain]);
      await client.query(`INSERT INTO "User" (id, email, "emailKey", "updatedAt") VALUES ($1,$2,$3,now())`,
        [account.id, address.email, address.emailKey]);
      if (account.name) {
        await client.query(`INSERT INTO "Profile" ("userId","directoryId","displayName","updatedAt") VALUES ($1,$2,$3,now())`,
          [account.id, account.directory, validateDisplayName(account.name)]);
      }
    }
    for (const community of feedQaCommunities) {
      await client.query(`INSERT INTO "Community" (id,"ownerId",name,description,visibility)
        VALUES ($1,$2,$3,$4,$5::"CommunityVisibility")`,
      [community.id, owner.id, community.name, "Fictional feed QA community", community.visibility]);
    }
    const communityId = (code: Community) => feedQaCommunities.find(community => community.code === code)!.id;
    for (const member of feedQaMemberships) {
      const account = member.account === "O" ? owner : reader;
      await client.query(`INSERT INTO "CommunityMembership" ("communityId","userId",status) VALUES ($1,$2,'MEMBER')`,
        [communityId(member.community), account.id]);
    }
    for (const row of feedQaPosts) {
      await client.query(`INSERT INTO "Post" (id,"communityId","authorId",type,title,body,"resourceUrl","createdAt")
        VALUES ($1,$2,$3,$4::"PostType",$5,$6,$7,$8)`,
      [row.id, communityId(row.community), row.author === "R" ? reader.id : owner.id,
        row.type, row.title, row.body, row.resource, row.createdAt]);
    }
    await client.query("COMMIT");
  } catch {
    try { await client.query("ROLLBACK"); } catch { /* Connection closure also rolls back an open transaction. */ }
    throw new Error("Feed fixture load failed in its disposable target; no retry or reset attempted");
  } finally { await client.end(); }
  return { fixture: feedFixtureVersion, accounts: feedQaAccounts.map(({ alias, email, name }) => ({ alias, email, name })),
    communities: feedQaCommunities, posts: feedQaPosts, expected: feedQaExpected };
}
