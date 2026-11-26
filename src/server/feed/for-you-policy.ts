import { timingSafeEqual } from "node:crypto";
import { communityId } from "../communities/policy.ts";
import { keyedDigest } from "../identity/policy.ts";
import { feedViewer } from "./policy.ts";

export const membershipBoostMilliseconds = 72 * 60 * 60 * 1000;
export type RankedPost = { id: string; createdAt: Date; currentMember: boolean };
export function rankTime(post: Pick<RankedPost, "createdAt" | "currentMember">) {
  return post.createdAt.getTime() + (post.currentMember ? membershipBoostMilliseconds : 0);
}
export function compareForYou(a: RankedPost, b: RankedPost) {
  return rankTime(b) - rankTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}
export function groupCutoff(anchor: RankedPost, currentMember: boolean) {
  return new Date(rankTime(anchor) - (currentMember ? membershipBoostMilliseconds : 0));
}
export function forYouCursor(anchor: RankedPost, userId: string, membershipScope: string, key: string) {
  const scope = JSON.stringify(["m4-for-you-membership-72h-v1", feedViewer(userId, key), membershipScope,
    communityId(anchor.id), anchor.createdAt.toISOString(), anchor.currentMember, rankTime(anchor)]);
  return `${anchor.id}.${keyedDigest(key, scope)}`;
}
export function verifyForYouCursor(cursor: string, anchor: RankedPost, userId: string, membershipScope: string, key: string) {
  const expected = forYouCursor(anchor, userId, membershipScope, key);
  if (cursor.length !== expected.length || !timingSafeEqual(Buffer.from(cursor), Buffer.from(expected))) throw new Error("Restart feed");
}
