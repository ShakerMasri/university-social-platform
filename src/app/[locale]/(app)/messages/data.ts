import { communityId } from "@/server/communities/policy";
import { messageBodyLimit, messagePageSize, pendingMessageLimit } from "@/server/messaging/policy";
export type Conversation = {
  id: string; state: "PENDING" | "ACCEPTED" | "REJECTED"; initiatedByMe: boolean;
  peer: { directoryId: string; displayName: string } | null;
  blockedByMe: boolean; contactBlocked: boolean; pendingRemaining: number;
  canSend: boolean; canAccept: boolean; canReject: boolean;
};
export type Message = { id: string; body: string; mine: boolean; createdAt: string };
export type ConversationPage = { scope: string; items: Conversation[]; next: string | null };
export type History = Conversation & { scope: string; items: Message[]; next: string | null };
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid messaging response");
  return value as Record<string, unknown>;
}
function conversation(value: unknown): Conversation {
  const row = record(value), peer = row.peer === null ? null : record(row.peer);
  if (!["PENDING", "ACCEPTED", "REJECTED"].includes(String(row.state)) ||
    ![row.initiatedByMe, row.blockedByMe, row.contactBlocked, row.canSend, row.canAccept, row.canReject].every(item => typeof item === "boolean") ||
    !Number.isInteger(row.pendingRemaining) || Number(row.pendingRemaining) < 0 || Number(row.pendingRemaining) > pendingMessageLimit ||
    (peer && (typeof peer.displayName !== "string" || !peer.displayName.trim() || Array.from(peer.displayName).length > 60))) throw new Error("Invalid conversation");
  return { id: communityId(row.id), state: row.state as Conversation["state"], initiatedByMe: row.initiatedByMe as boolean,
    peer: peer ? { directoryId: communityId(peer.directoryId), displayName: peer.displayName as string } : null,
    blockedByMe: row.blockedByMe as boolean, contactBlocked: row.contactBlocked as boolean, pendingRemaining: row.pendingRemaining as number,
    canSend: row.canSend as boolean, canAccept: row.canAccept as boolean, canReject: row.canReject as boolean };
}
function page(value: unknown) {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > messagePageSize) throw new Error("Invalid messaging page");
  return { row, items: row.items as unknown[], scope: communityId(row.scope), next: row.next === null ? null : communityId(row.next) };
}
export function conversationPage(value: unknown): ConversationPage {
  const parsed = page(value);
  return { scope: parsed.scope, next: parsed.next, items: parsed.items.map(conversation) };
}
export function historyPage(value: unknown): History {
  const parsed = page(value);
  return { ...conversation(parsed.row), scope: parsed.scope, next: parsed.next, items: parsed.items.map(value => {
    const row = record(value);
    if (typeof row.body !== "string" || Array.from(row.body).length > messageBodyLimit || typeof row.mine !== "boolean" ||
      typeof row.createdAt !== "string" || !Number.isFinite(new Date(row.createdAt).getTime())) throw new Error("Invalid message");
    return { id: communityId(row.id), body: row.body, mine: row.mine, createdAt: row.createdAt };
  }) };
}
