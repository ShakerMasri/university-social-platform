import { timingSafeEqual } from "node:crypto";
import { communityId } from "../communities/policy.ts";
import { keyedDigest } from "../identity/policy.ts";

export const feedPageSize = 20;
export function feedInput(parameters: URLSearchParams) {
  const keys = [...parameters.keys()];
  if (keys.length > 1 || keys.some(key => key !== "after")) throw new Error("Invalid feed parameters");
  const after = parameters.get("after");
  if (after !== null && !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(after)) throw new Error("Invalid feed cursor");
  if (after !== null) communityId(after.slice(0, 36));
  return after ?? undefined;
}
export function feedViewer(userId: string, key: string) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Feed signing unavailable");
  return keyedDigest(key, `m4-feed-viewer-v1:${communityId(userId)}`);
}
export function feedCursor(id: string, createdAt: Date, userId: string, membershipScope: string, key: string) {
  const viewer = feedViewer(userId, key);
  const scope = JSON.stringify(["m4-feed-v1", viewer, membershipScope, communityId(id), createdAt.toISOString()]);
  return `${id}.${keyedDigest(key, scope)}`;
}
export function verifyFeedCursor(cursor: string, createdAt: Date, userId: string, membershipScope: string, key: string) {
  const expected = feedCursor(communityId(cursor.slice(0, 36)), createdAt, userId, membershipScope, key);
  if (cursor.length !== expected.length || !timingSafeEqual(Buffer.from(cursor), Buffer.from(expected))) throw new Error("Restart feed");
}
