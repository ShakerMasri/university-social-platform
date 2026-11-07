import { timingSafeEqual } from "node:crypto";
import { communityId } from "../communities/policy.ts";
import { validateDisplayName } from "../database/validation.ts";
import { digest, keyedDigest } from "../identity/policy.ts";
import { normalizeArchiveText } from "../archive/policy.ts";

export const peoplePageSize = 20;
export type PeopleInput = { query: string; after?: string };
export function profileSuggestion(userId: string) {
  return digest(`profile-label:${communityId(userId)}`).slice(0, 10).toUpperCase();
}
export function directoryProfileInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["displayName", "directoryVisible"].includes(key)) || typeof value.directoryVisible !== "boolean") throw new Error("Invalid profile input");
  const displayName = validateDisplayName(value.displayName);
  return { displayName, directoryVisible: value.directoryVisible };
}
export function peopleInput(parameters: URLSearchParams): PeopleInput {
  const keys = [...parameters.keys()], raw = parameters.get("q");
  if (keys.length > 2 || new Set(keys).size !== keys.length || keys.some(key => !["q", "after"].includes(key)) ||
      raw === null || !raw.isWellFormed() || Array.from(raw).length > 60 || /[\p{Cc}\p{Cf}]/u.test(raw)) throw new Error("Invalid people query");
  const query = normalizeArchiveText(raw.trim()).replace(/\s+/gu, " ");
  if (Array.from(query).length < 2) throw new Error("Invalid people query");
  const after = parameters.get("after");
  if (after !== null && !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(after)) throw new Error("Invalid people cursor");
  if (after !== null) communityId(after.slice(0, 36));
  return { query, ...(after === null ? {} : { after }) };
}
export function peopleCursor(id: string, input: PeopleInput, actorId: string, key: string) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("People signing unavailable");
  const scope = JSON.stringify(["m4-people-v3", actorId, input.query, communityId(id)]);
  return `${id}.${keyedDigest(key, scope)}`;
}
export function peopleAnchor(input: PeopleInput, actorId: string, key: string) {
  if (!input.after) return undefined;
  const id = communityId(input.after.slice(0, 36)), expected = peopleCursor(id, input, actorId, key);
  if (input.after.length !== expected.length || !timingSafeEqual(Buffer.from(input.after), Buffer.from(expected))) throw new Error("Restart people search");
  return id;
}
