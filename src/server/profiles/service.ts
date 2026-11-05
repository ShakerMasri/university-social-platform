import "server-only";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { authorized, CommunityError, reserveAttempt } from "../communities/service.ts";
import { communityId } from "../communities/policy.ts";
import { InputError } from "../communities/http.ts";
import { ProfileSaveRateLimited, updateOwnProfile } from "../identity/service.ts";
import { lockDirectoryProfile } from "./locking.ts";
import { directoryProfileInput, peopleAnchor, peopleCursor, peoplePageSize, profileSuggestion, type PeopleInput } from "./policy.ts";

export function ownDirectoryProfile(db: PrismaClient, token: unknown) {
  return authorized(db, token, async (tx, userId) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true,
      profile: { select: { displayName: true, directoryVisible: true } } } });
    return { email: user.email, displayName: user.profile?.displayName ?? null,
      directoryVisible: user.profile?.directoryVisible ?? false, suggestion: profileSuggestion(userId) };
  });
}
export async function saveDirectoryProfile(db: PrismaClient, token: unknown, value: Record<string, unknown>) {
  const input = directoryProfileInput(value);
  try {
    if (!await updateOwnProfile(db, token, input.displayName, input.directoryVisible)) throw new CommunityError(401);
  } catch (error) {
    if (error instanceof ProfileSaveRateLimited) throw new CommunityError(429);
    throw error;
  }
}
function readable(input?: PeopleInput) {
  // Matching uses the existing archive normalization without exporting email or
  // adding a derived index. strpos keeps %, _ and quotes literal, with bound SQL.
  const match = input ? Prisma.sql`AND strpos(lower(regexp_replace(normalize(p."displayName", NFC),
    ${"[\u0640\u064b-\u0652\u0670]"}, '', 'g')), ${input.query}) > 0` : Prisma.empty;
  return Prisma.sql`p."directoryVisible" AND u."emailVerifiedAt" IS NOT NULL ${match}`;
}
export function peopleCandidateQuery(input: PeopleInput, after?: string) {
  return Prisma.sql`SELECT p."userId", p."directoryId" AS id FROM "Profile" p JOIN "User" u ON u.id = p."userId"
    WHERE ${readable(input)} ${after ? Prisma.sql`AND p."directoryId" > ${after}::uuid` : Prisma.empty}
    ORDER BY p."directoryId" LIMIT ${peoplePageSize + 1}`;
}
export async function searchPeople(db: PrismaClient, token: unknown, input: PeopleInput, key: string) {
  await reserveAttempt(db, token, "m4-people-read");
  return authorized(db, token, async (tx, actorId) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    let after: string | undefined;
    try { after = peopleAnchor(input, actorId, key); } catch { throw new InputError("Restart people search"); }
    // Candidates contain only internal lock IDs and independent directory IDs.
    const candidates = await tx.$queryRaw<{ userId: string; id: string }[]>(peopleCandidateQuery(input, after));
    const anchor = after ? await tx.profile.findUnique({ where: { directoryId: after }, select: { userId: true } }) : null;
    if (after && !anchor) throw new CommunityError(404);
    for (const userId of [...new Set([...candidates.map(row => row.userId), ...(anchor ? [anchor.userId] : [])])].sort()) await lockDirectoryProfile(tx, userId);
    if (after && !(await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p."directoryId" AS id FROM "Profile" p JOIN "User" u ON u.id = p."userId"
      WHERE p."directoryId" = ${after}::uuid AND ${readable(input)}`)).length) throw new CommunityError(404);
    // Recheck visibility AND matching after locks, including the lookahead.
    const rows = candidates.length ? await tx.$queryRaw<{ id: string; displayName: string }[]>(Prisma.sql`
      SELECT p."directoryId" AS id, p."displayName" FROM "Profile" p JOIN "User" u ON u.id = p."userId"
      WHERE p."directoryId" IN (${Prisma.join(candidates.map(row => Prisma.sql`${row.id}::uuid`))}) AND ${readable(input)} ORDER BY p."directoryId"`) : [];
    const items = rows.slice(0, peoplePageSize);
    return { items, next: rows.length > peoplePageSize ? peopleCursor(items.at(-1)!.id, input, actorId, key) : null };
  });
}
export async function readDirectoryProfile(db: PrismaClient, token: unknown, value: unknown) {
  const id = communityId(value);
  await reserveAttempt(db, token, "m4-people-read");
  return authorized(db, token, async tx => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', '3000', true)`;
    const candidate = await tx.profile.findUnique({ where: { directoryId: id }, select: { userId: true } });
    if (!candidate) throw new CommunityError(404);
    await lockDirectoryProfile(tx, candidate.userId);
    const row = await tx.profile.findFirst({ where: { directoryId: id, directoryVisible: true, user: { emailVerifiedAt: { not: null } } },
      select: { directoryId: true, displayName: true } });
    if (!row) throw new CommunityError(404);
    return { id: row.directoryId, displayName: row.displayName };
  });
}
