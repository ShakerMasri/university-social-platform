import { communityId } from "../communities/policy";

export const messageBodyLimit = 4_000;
export const messageRequestBytes = 32_768;
export const messagePageSize = 20;
export const pendingMessageLimit = 5;

export type MessageRequestState = "PENDING" | "ACCEPTED" | "REJECTED";
export type MessageRequest = {
  firstId: string; secondId: string; initiatorId: string;
  state: MessageRequestState; pendingMessages: number;
};

function participant(request: MessageRequest, actorId: string) {
  return actorId === request.firstId || actorId === request.secondId;
}

// Pure policy for a NEW message, evaluated only on a locked server snapshot.
// This is not authentication: callers must separately enforce live sessions,
// verified accounts/profiles, durable budgets and bilateral blocks. Same-payload
// retries reconcile the persisted request ID before applying the new-write cap,
// but may never bypass current blocks, rejection or account/session revocation.
export function canAppendMessage(request: MessageRequest, actorId: string, blocked: boolean) {
  if (!participant(request, actorId) || blocked || request.state === "REJECTED") return false;
  if (request.state === "ACCEPTED") return true;
  return actorId === request.initiatorId && Number.isInteger(request.pendingMessages) &&
    request.pendingMessages >= 1 && request.pendingMessages < pendingMessageLimit;
}

// Decisions express desired state. Only the original recipient can accept or
// reject; accepting later reopens rejection. A blocked recipient can still
// reject a pending request, but cannot resume contact until unblocked.
export function decideMessageRequest(request: MessageRequest, actorId: string, decision: "accept" | "reject", blocked: boolean): MessageRequestState {
  if (!participant(request, actorId) || actorId === request.initiatorId) throw new Error("Messaging unavailable");
  if (decision === "accept") {
    if (blocked) throw new Error("Messaging unavailable");
    return "ACCEPTED";
  }
  if (request.state === "ACCEPTED") throw new Error("Messaging unavailable");
  return "REJECTED";
}

// Shared by first-message requests and accepted-conversation sends. Actor,
// recipient, timestamps and request status must come from the server, never JSON.
export function messageInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["requestId", "body"].includes(key)) || typeof value.body !== "string") {
    throw new Error("Invalid message input");
  }
  // Reject huge strings before trim/allocation. At most two UTF-16 units per
  // valid code point, with the HTTP layer separately enforcing the byte cap.
  if (value.body.length > messageRequestBytes) throw new Error("Invalid message text");
  const body = value.body.trim();
  let length = 0;
  for (const character of body) {
    const point = character.codePointAt(0)!;
    if (++length > messageBodyLimit || (point >= 0xd800 && point <= 0xdfff) || point === 127 ||
      (point < 32 && ![9, 10, 13].includes(point))) throw new Error("Invalid message text");
  }
  if (length === 0) throw new Error("Invalid message text");
  return { requestId: communityId(value.requestId), body };
}

// Canonical order is independent of contact direction or UUID letter case.
// The eventual persistence boundary must enforce the same distinct pair and
// uniqueness in PostgreSQL, and serialize pair mutations with block changes.
export function messagePair(first: unknown, second: unknown) {
  const firstId = communityId(first), secondId = communityId(second);
  if (firstId === secondId) throw new Error("Messaging unavailable");
  return firstId < secondId ? { firstId, secondId } : { firstId: secondId, secondId: firstId };
}

export function messageBlockInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => key !== "blocked") || typeof value.blocked !== "boolean") {
    throw new Error("Invalid block input");
  }
  return { blocked: value.blocked };
}

export function messageDecisionInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => key !== "decision") || (value.decision !== "accept" && value.decision !== "reject")) {
    throw new Error("Invalid message decision");
  }
  return value.decision;
}
