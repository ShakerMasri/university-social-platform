import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { messagingHTTP } from "./http";
import { MessagingError } from "./service";
import { CommunityError } from "../communities/service";
import { POST } from "../../app/api/people/[id]/messages/route";
import { contactPerson } from "./service";
vi.mock("../identity/local", () => ({ requireLocalIdentity: () => ({ context: { origin: "http://localhost:3100" } }), identityDatabase: () => ({}) }));
vi.mock("./service", async original => ({ ...await original<typeof import("./service")>(), contactPerson: vi.fn() }));
const origin = "http://localhost:3100", id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
function request(body: string, contentType = "application/json", source: string | null = origin) {
  return new NextRequest(`${origin}/api/people/${id}/messages`, { method: "POST", headers: {
    "content-type": contentType, ...(source === null ? {} : { origin: source }),
  }, body });
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("messaging HTTP boundary", () => {
  it.each([401, 403, 404, 409] as const)("keeps expected %s denials private and quiet", async status => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await messagingHTTP(request("{}"), async () => { throw new MessagingError(status); });
    expect(result.status).toBe(status); expect(await result.json()).toEqual({ ok: false });
    expect(result.headers.get("cache-control")).toBe("private, no-store"); expect(result.headers.has("set-cookie")).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
  it("translates durable budget failures and sanitizes unexpected outages", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await messagingHTTP(request("{}"), async () => { throw new CommunityError(429); })).status).toBe(429);
    const result = await messagingHTTP(request("{}"), async () => { throw new Error("private message database password"); });
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ ok: false });
    expect(log.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "messaging.http.failed" })]]);
  });
  it.each([null, "https://attacker.invalid"])("requires the exact write origin %s", async source => {
    expect((await POST(request("{}", "application/json", source), context)).status).toBe(403);
    expect(contactPerson).not.toHaveBeenCalled();
  });
  it.each([
    ['{"body":"x","requestId":"invalid"}', "application/json"],
    [JSON.stringify({ body: "x", requestId: id, senderId: id }), "application/json"],
    [JSON.stringify({ body: "x", requestId: id }), "application/jsonx"],
    [JSON.stringify({ body: "x", requestId: id }), "Application/JSON+problem"],
    [JSON.stringify({ body: "x", requestId: id }), "text/json"],
    [JSON.stringify({ body: "x", requestId: id }), "Application/JSON; CHARSET=ISO-8859-1"],
    [JSON.stringify({ body: "x", requestId: id }), "Application/JSON; extra=1"],
    [JSON.stringify({ body: "x", requestId: id }), "Application/JSON; charset=utf-8; charset=utf-8"],
    [JSON.stringify({ body: "x", requestId: id, senderId: id }), "Application/JSON"],
    [JSON.stringify({ body: "x".repeat(33000), requestId: id }), "Application/JSON"],
    [JSON.stringify({ body: "x".repeat(33000), requestId: id }), "application/json"],
    [JSON.stringify({ body: "😀".repeat(4001), requestId: id }), "application/json"],
    [JSON.stringify({ body: "\ud800", requestId: id }), "application/json"],
    ["[]", "application/json"], ["{", "application/json"],
  ])("rejects malformed, forged or oversized input before the service", async (body, type) => {
    expect((await POST(request(body, type), context)).status).toBe(400); expect(contactPerson).not.toHaveBeenCalled();
  });
  it.each(["application/json", "Application/JSON", "aPpLiCaTiOn/JsOn", "application/json; CHARSET=UTF-8", "Application/JSON; charset=UTF-8"])("passes bounded bilingual inert text with equivalent JSON media type %s", async contentType => {
    const body = { body: "مرحبا 😀 <script>inert</script>", requestId: id };
    vi.mocked(contactPerson).mockResolvedValueOnce({ conversationId: id, messageId: id });
    const result = await POST(request(JSON.stringify(body), contentType), context);
    expect(result.status).toBe(200); expect(contactPerson).toHaveBeenCalledWith({}, undefined, id, body);
  });
  it("rejects query parameters even with an otherwise valid mixed-case content type", async () => {
    const req = request(JSON.stringify({ body: "x", requestId: id }), "Application/JSON");
    req.nextUrl.searchParams.set("actor", id);
    expect((await POST(req, context)).status).toBe(400); expect(contactPerson).not.toHaveBeenCalled();
  });
});
