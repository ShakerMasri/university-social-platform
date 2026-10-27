import { communityId } from "../communities/policy";

export const postTypes = ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"] as const;
export type PostType = typeof postTypes[number];
export const postPageSize = 20;
export const postRequestBytes = 65_536;
export const postTitleLimit = 160;
export const postBodyLimit = 10_000;
export const postLinkLimit = 2_048;

function text(value: unknown, maximum: number, multiline: boolean) {
  if (typeof value !== "string") throw new Error("Invalid post text");
  const result = value.trim();
  if (!result || Array.from(result).length > maximum || Array.from(result).some(character => {
    const code = character.codePointAt(0)!;
    return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)));
  })) throw new Error("Invalid post text");
  return result;
}
export function postInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["requestId", "type", "title", "body", "resourceUrl"].includes(key)) ||
      typeof value.type !== "string" || !postTypes.includes(value.type as PostType)) throw new Error("Invalid post input");
  const type = value.type as PostType;
  let resourceUrl: string | null = null;
  if ("resourceUrl" in value && type !== "RESOURCE") throw new Error("Resource links require a resource post");
  if (value.resourceUrl !== undefined && value.resourceUrl !== null && value.resourceUrl !== "") {
    if (typeof value.resourceUrl !== "string") throw new Error("Invalid resource link");
    const link = value.resourceUrl.trim();
    if (link.length > postLinkLimit || (/\s/u.test(link) || Array.from(link).some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127))) throw new Error("Invalid resource link");
    let url: URL;
    try { url = new URL(link); } catch { throw new Error("Invalid resource link"); }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > postLinkLimit) throw new Error("Invalid resource link");
    resourceUrl = url.href;
  }
  return { requestId: communityId(value.requestId), type, title: text(value.title, postTitleLimit, false),
    body: text(value.body, postBodyLimit, true), resourceUrl };
}
