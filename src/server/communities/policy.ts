export const communityPageSize = 20;
export type CommunityInput = { name: string; description: string; visibility: "PUBLIC" | "PRIVATE" };
export type MembershipAction = "join" | "leave" | "approve" | "remove";

function text(value: unknown, maximum: number, required: boolean) {
  if (typeof value !== "string") throw new Error("Invalid community text");
  const trimmed = value.trim();
  const forbiddenControl = Array.from(trimmed).some((character) => {
    const point = character.codePointAt(0)!;
    return point === 127 || (point < 32 && ![9, 10, 13].includes(point));
  });
  if ((required && !trimmed) || Array.from(trimmed).length > maximum || forbiddenControl) {
    throw new Error("Invalid community text");
  }
  return trimmed;
}
export function communityInput(value: Record<string, unknown>): CommunityInput {
  if (Object.keys(value).some((key) => !["name", "description", "visibility"].includes(key)) ||
      (value.visibility !== "PUBLIC" && value.visibility !== "PRIVATE")) throw new Error("Invalid community input");
  const name = text(value.name, 80, true);
  if (/[\r\n\t]/u.test(name)) throw new Error("Invalid community name");
  return { name, description: text(value.description, 1000, false), visibility: value.visibility };
}
export function communityId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid identifier");
  return value.toLowerCase();
}
export function membershipInput(value: Record<string, unknown>) {
  if (Object.keys(value).some((key) => !["action", "userId"].includes(key)) ||
      typeof value.action !== "string" ||
      !["join", "leave", "approve", "remove"].includes(value.action)) throw new Error("Invalid membership input");
  const action = value.action as MembershipAction;
  if (action === "join" || action === "leave") {
    if ("userId" in value) throw new Error("Self membership only");
    return { action, userId: undefined };
  }
  return { action, userId: communityId(value.userId) };
}
