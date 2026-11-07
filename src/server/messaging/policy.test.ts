import { describe, expect, it } from "vitest";
import { canAppendMessage, decideMessageRequest, messageBlockInput, messageInput, messagePair, type MessageRequest } from "./policy";

const requestId = "aaaaaaaa-2222-3333-4444-555555555555";
const otherId = "bbbbbbbb-2222-3333-4444-555555555555";

describe("plain-text messaging boundary", () => {
  it("preserves bilingual text, internal whitespace and inert markup", () => {
    const body = 'English\tعربي\r\n😀 <script>alert(1)</script>';
    expect(messageInput({ requestId: requestId.toUpperCase(), body: `  ${body} \n` })).toEqual({ requestId, body });
    expect(messageInput({ requestId, body: "😀".repeat(4000) }).body).toBe("😀".repeat(4000));
  });
  it("rejects empty, oversized, malformed Unicode and unsafe control text", () => {
    for (const body of [undefined, null, [], 1, "", " \t\n", "😀".repeat(4001), "a".repeat(32769),
      "x\0y", "x\u0001y", "x\u007fy", "\ud800", "a\udfffb", "\udfff\ud800"]) {
      expect(() => messageInput({ requestId, body })).toThrow();
    }
  });
  it("rejects forged participants, timestamps, status and unrelated content fields", () => {
    for (const field of ["senderId", "recipientId", "conversationId", "role", "createdAt", "status", "accepted", "communityId", "replyToId"]) {
      expect(() => messageInput({ requestId, body: "Hello", [field]: requestId })).toThrow();
    }
    for (const id of [undefined, null, [], 1, "bad"]) expect(() => messageInput({ requestId: id, body: "Hello" })).toThrow();
  });
});

describe("stable distinct messaging pair", () => {
  it("uses the same canonical pair across opposite-direction and mixed-case requests", () => {
    const expected = { firstId: requestId, secondId: otherId };
    expect(messagePair(requestId, otherId)).toEqual(expected);
    expect(messagePair(otherId.toUpperCase(), requestId.toUpperCase())).toEqual(expected);
  });
  it("rejects self-contact and malformed identifiers", () => {
    expect(() => messagePair(requestId, requestId.toUpperCase())).toThrow("Messaging unavailable");
    for (const id of [undefined, null, [], "invalid"]) expect(() => messagePair(requestId, id)).toThrow();
  });
});

describe("directed desired-state blocks", () => {
  it("requires an explicit boolean and rejects client-supplied blocker authority", () => {
    expect(messageBlockInput({ blocked: true })).toEqual({ blocked: true });
    expect(messageBlockInput({ blocked: false })).toEqual({ blocked: false });
    for (const blocked of [undefined, null, "false", 0, 1, []]) expect(() => messageBlockInput({ blocked })).toThrow();
    expect(() => messageBlockInput({ blocked: false, blockerId: otherId })).toThrow();
  });
});

describe("recipient-controlled message requests", () => {
  const pending: MessageRequest = { firstId: requestId, secondId: otherId, initiatorId: requestId, state: "PENDING", pendingMessages: 1 };
  const stranger = "cccccccc-2222-3333-4444-555555555555";
  it("allows up to five initiator messages, requiring acceptance before a recipient reply", () => {
    for (const pendingMessages of [1, 2, 3, 4]) expect(canAppendMessage({ ...pending, pendingMessages }, requestId, false)).toBe(true);
    for (const pendingMessages of [0, 5, 6, -1, 1.5, Number.NaN]) expect(canAppendMessage({ ...pending, pendingMessages }, requestId, false)).toBe(false);
    expect(canAppendMessage(pending, otherId, false)).toBe(false);
    expect(canAppendMessage({ ...pending, initiatorId: otherId }, otherId, false)).toBe(true);
  });
  it("requires the original recipient to accept/reject and never auto-accepts an opposite-direction send", () => {
    for (const actor of [requestId, stranger]) {
      for (const decision of ["accept", "reject"] as const) expect(() => decideMessageRequest(pending, actor, decision, false)).toThrow("Messaging unavailable");
    }
    expect(decideMessageRequest(pending, otherId, "accept", false)).toBe("ACCEPTED");
    expect(decideMessageRequest(pending, otherId, "reject", false)).toBe("REJECTED");
    expect(canAppendMessage(pending, stranger, false)).toBe(false);
  });
  it("supports idempotent decisions and recipient reopening, while rejection denies both send directions", () => {
    const rejected = { ...pending, state: "REJECTED" as const };
    expect(decideMessageRequest(rejected, otherId, "reject", false)).toBe("REJECTED");
    expect(decideMessageRequest(rejected, otherId, "accept", false)).toBe("ACCEPTED");
    for (const actor of [requestId, otherId]) expect(canAppendMessage(rejected, actor, false)).toBe(false);
    const accepted = { ...pending, state: "ACCEPTED" as const, pendingMessages: 5 };
    expect(decideMessageRequest(accepted, otherId, "accept", false)).toBe("ACCEPTED");
    expect(() => decideMessageRequest(accepted, otherId, "reject", false)).toThrow();
    for (const actor of [requestId, otherId]) expect(canAppendMessage(accepted, actor, false)).toBe(true);
    expect(canAppendMessage(accepted, stranger, false)).toBe(false);
  });
  it("denies sends and acceptance under a block, retaining rejection control without mutating correspondence", () => {
    for (const state of ["PENDING", "ACCEPTED", "REJECTED"] as const) {
      const request = Object.freeze({ ...pending, state });
      for (const actor of [requestId, otherId]) expect(canAppendMessage(request, actor, true)).toBe(false);
      expect(() => decideMessageRequest(request, otherId, "accept", true)).toThrow();
      if (state === "ACCEPTED") expect(() => decideMessageRequest(request, otherId, "reject", true)).toThrow();
      else expect(decideMessageRequest(request, otherId, "reject", true)).toBe("REJECTED");
      expect(request.state).toBe(state);
    }
  });
});
