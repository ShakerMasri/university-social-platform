import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/identity/[operation]/route";
import { communityHTTP, InputError } from "./communities/http";
import { CommunityError } from "./communities/service";
import { requireLocalIdentity } from "./identity/local";
import { ownProfile, ProfileSaveRateLimited, updateOwnProfile } from "./identity/service";

vi.mock("./identity/local", () => ({
  requireLocalIdentity: vi.fn(() => ({ context: { origin: "http://127.0.0.1:3100" }, ip: "127.0.0.1" })),
  identityDatabase: vi.fn(() => ({})),
}));
vi.mock("./identity/service", async (importOriginal) => ({
  ...await importOriginal<typeof import("./identity/service")>(),
  ownProfile: vi.fn(), updateOwnProfile: vi.fn(), allowIP: vi.fn(),
  confirmSignIn: vi.fn(), logout: vi.fn(), requestSignIn: vi.fn(),
}));
const origin = "http://127.0.0.1:3100";
const params = { params: Promise.resolve({ operation: "profile" }) };
// Deliberately sensitive fixture: no part of this error may cross either boundary.
const sensitiveFailure = new Error("postgresql://fixture:password@localhost/private?token=secret user@university.test");
const request = (method = "GET") => new NextRequest(`${origin}/api/identity/profile`, {
  method, headers: { origin, "content-type": "application/json", cookie: "session=secret" },
  ...(method === "POST" ? { body: JSON.stringify({ displayName: "Private fixture" }) } : {}),
});

describe("operational failure boundaries", () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("reports profile read failures using only a fixed event and keeps HTTP output generic", async () => {
    vi.mocked(ownProfile).mockRejectedValueOnce(sensitiveFailure);
    const response = await GET(request(), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(errors.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "identity.http.get_failed" })]]);
  });

  it("reports failed profile writes without success or cookie mutations", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValueOnce(sensitiveFailure);
    const response = await POST(request("POST"), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(errors.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "identity.http.post_failed" })]]);
  });
  it("translates the legacy profile budget denial without cookies or failure diagnostics", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValueOnce(new ProfileSaveRateLimited());
    const response = await POST(request("POST"), params);
    expect(response.status).toBe(429); expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.has("set-cookie")).toBe(false); expect(errors).not.toHaveBeenCalled();
  });

  it("reports unexpected community failures without exception or request content", async () => {
    const response = await communityHTTP(request(), async () => { throw sensitiveFailure; });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(errors.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "communities.http.failed" })]]);
  });

  it("keeps expected invalid input, authorization denials and disabled flows quiet", async () => {
    expect((await communityHTTP(request(), async () => { throw new InputError("Invalid"); })).status).toBe(400);
    expect((await communityHTTP(request(), async () => { throw new CommunityError(403); })).status).toBe(403);
    vi.mocked(requireLocalIdentity).mockImplementationOnce(() => { throw new Error("Disabled"); });
    expect((await GET(request(), params)).status).toBe(503);
    expect(errors).not.toHaveBeenCalled();
  });
  it("identifies archive failures without logging queries, content or provider errors", async () => {
    const response = await communityHTTP(request(), async () => { throw sensitiveFailure; }, "archive.http.failed");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(errors.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "archive.http.failed" })]]);
  });
  it("identifies profile failures without logging names, queries or database details", async () => {
    const response = await communityHTTP(request(), async () => { throw sensitiveFailure; }, "profiles.http.failed");
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false });
    expect(errors.mock.calls).toEqual([[JSON.stringify({ level: "error", event: "profiles.http.failed" })]]);
  });
});
