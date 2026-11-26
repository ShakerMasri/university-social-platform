import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { CommunityError } from "../communities/service";
import { InputError } from "../communities/http";
import { retrieveEvidence } from "./service";
import { retrievePreparedQuestionEvidence } from "./questions";

vi.mock("./service.ts", () => ({ retrieveEvidence: vi.fn() }));
const db = {} as PrismaClient, token = "synthetic-session", result = { evidence: [], interrupted: false };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(retrieveEvidence).mockResolvedValue(result); });
describe("prepared-question boundary (mocked raw retrieval)", () => {
  it.each([
    ["How do DNS records work?", "DNS records work"], ["ما معنى التشفير؟", "التشفير"], ["What is C++?", "C++"],
    ["Why is TLS not obsolete?", "Why is TLS not obsolete?"], ["ما معنى من؟", "ما معنى من؟"], ["What is CAN??", "What is CAN??"],
  ])("delegates once with current credentials and returns the raw evidence unchanged: %s", async (query, expected) => {
    const input = new URLSearchParams({ q: query, community: "00000000-0000-4000-b000-000000000001", type: "DISCUSSION" });
    expect(await retrievePreparedQuestionEvidence(db, token, input)).toBe(result);
    expect(retrieveEvidence).toHaveBeenCalledTimes(1);
    const [actualDB, actualToken, parameters] = vi.mocked(retrieveEvidence).mock.calls[0];
    expect(actualDB).toBe(db); expect(actualToken).toBe(token); expect(parameters.get("q")).toBe(expected);
    expect(parameters.get("community")).toBe(input.get("community")); expect(parameters.get("type")).toBe("DISCUSSION");
    expect(input.get("q")).toBe(query);
  });
  it.each(["q=How+can+I+prevent+race+conditions+in+shared+memory+programs%3F", `q=${"x".repeat(201)}`, "q=What+is+C%2B%2B%3F&q=other", "q=What+is+C%2B%2B%3F&after=", "q=What+is+C%2B%2B%3F&url=https://example.test"])("rejects original invalid input before raw database work: %s", async query => {
    await expect(retrievePreparedQuestionEvidence(db, token, new URLSearchParams(query))).rejects.toBeInstanceOf(InputError);
    expect(retrieveEvidence).not.toHaveBeenCalled();
  });
  it("propagates authorization, budget and unexpected failures without fallback reads", async () => {
    for (const error of [new CommunityError(401), new CommunityError(404), new CommunityError(429), new Error("Unavailable")]) {
      vi.mocked(retrieveEvidence).mockRejectedValueOnce(error);
      await expect(retrievePreparedQuestionEvidence(db, token, new URLSearchParams({ q: "What is C++?" }))).rejects.toBe(error);
    }
    expect(retrieveEvidence).toHaveBeenCalledTimes(4);
  });
});
