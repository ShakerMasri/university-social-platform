import { timingSafeEqual } from "node:crypto";
import { communityId } from "../communities/policy.ts";
import { postTypes, type PostType } from "../posts/policy.ts";
import { keyedDigest } from "../identity/policy.ts";

export const archivePageSize = 20;
export const archiveExcerptLimit = 240;
export type ArchiveInput = { query: string; terms: string[]; communityId?: string; type?: PostType; after?: string };
export function normalizeArchiveText(value: string) {
  return value.normalize("NFC").replace(/\u0640|[\u064b-\u0652]|\u0670/gu, "").toLowerCase();
}
export function archiveInput(parameters: URLSearchParams): ArchiveInput {
  const keys = [...parameters.keys()];
  if (keys.length > 4 || new Set(keys).size !== keys.length || keys.some(key => !["q", "community", "type", "after"].includes(key))) throw new Error("Invalid archive parameters");
  const raw = parameters.get("q") ?? "";
  if (Array.from(raw).length > 200 || /[\p{Cc}\p{Cf}]/u.test(raw)) throw new Error("Invalid archive query");
  const query = raw.trim().replace(/\s+/gu, " ");
  const words = normalizeArchiveText(query).split(" ").filter(Boolean), terms = [...new Set(words)];
  if (Array.from(query).length < 2 || words.length > 8 || !terms.length || !terms.every(term => /[\p{L}\p{N}]/u.test(term))) throw new Error("Invalid archive terms");
  const community = parameters.get("community"), type = parameters.get("type"), after = parameters.get("after");
  if (type !== null && !postTypes.includes(type as PostType)) throw new Error("Invalid archive type");
  if (after !== null && !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(after)) throw new Error("Invalid archive cursor");
  if (after) communityId(after.slice(0, 36));
  return { query, terms, ...(community === null ? {} : { communityId: communityId(community) }),
    ...(type === null ? {} : { type: type as PostType }), ...(after === null ? {} : { after }) };
}
export function archiveCursor(id: string, input: ArchiveInput, userId: string, key: string) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Archive signing unavailable");
  const scope = JSON.stringify(["m4-archive-v1", userId, input.terms, input.communityId ?? null, input.type ?? null, communityId(id)]);
  return `${id}.${keyedDigest(key, scope)}`;
}
export function archiveAnchor(input: ArchiveInput, userId: string, key: string) {
  if (!input.after) return undefined;
  const id = communityId(input.after.slice(0, 36));
  const expected = archiveCursor(id, input, userId, key);
  if (input.after.length !== expected.length || !timingSafeEqual(Buffer.from(input.after), Buffer.from(expected))) throw new Error("Archive cursor scope changed");
  return id;
}
