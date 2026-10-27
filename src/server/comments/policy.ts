import { communityId } from "../communities/policy";

export const commentPageSize = 20;
export const commentRequestBytes = 32_768;
export const commentBodyLimit = 4_000;

export function commentInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["requestId", "body"].includes(key)) || typeof value.body !== "string") throw new Error("Invalid comment input");
  const body = value.body.trim(), characters = Array.from(body);
  if (!body || characters.length > commentBodyLimit || characters.some(character => {
    const code = character.codePointAt(0)!;
    // Iteration combines valid surrogate pairs; remaining surrogates cannot
    // round-trip through PostgreSQL UTF-8 and must fail before persistence.
    return (code >= 0xd800 && code <= 0xdfff) || code === 127 || (code < 32 && ![9, 10, 13].includes(code));
  })) throw new Error("Invalid comment text");
  return { requestId: communityId(value.requestId), body };
}
