import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: undefined as string | undefined,
  enabled: true,
  requireIdentity: vi.fn(), database: vi.fn(), profile: vi.fn(), notifications: vi.fn(), report: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("@/server/identity/local", () => ({
  localIdentity: () => mocks.enabled ? {} : undefined,
  requireLocalIdentity: mocks.requireIdentity, identityDatabase: mocks.database,
}));
vi.mock("@/server/profiles/service", () => ({ ownDirectoryProfile: mocks.profile }));
vi.mock("@/server/notifications/service", () => ({ countUnreadNotifications: mocks.notifications }));
vi.mock("@/server/diagnostics", () => ({ reportOperationalFailure: mocks.report }));
import { loadViewer } from "./viewer";
import { CommunityError } from "@/server/communities/service";

const profile = { email: "private.person@university.test", displayName: "Synthetic أحمد", suggestion: "ABCDEF0123" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true; mocks.token = "a".repeat(43);
  mocks.requireIdentity.mockReturnValue({ context: {} }); mocks.database.mockReturnValue({});
  mocks.profile.mockResolvedValue(profile);
  mocks.notifications.mockResolvedValue(3);
});

describe("header viewer state", () => {
  it("is anonymous without touching the database when there is no session cookie", async () => {
    mocks.token = undefined;
    expect(await loadViewer()).toEqual({ state: "anonymous" });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("is anonymous for a malformed cookie without touching the database", async () => {
    mocks.token = "not-a-token";
    expect(await loadViewer()).toEqual({ state: "anonymous" });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("leaves ordinary startup signed out even with a well-formed cookie", async () => {
    mocks.enabled = false;
    expect(await loadViewer()).toEqual({ state: "anonymous" });
    expect(mocks.requireIdentity).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("carries only the name, an opaque avatar seed and the unread count; never the email", async () => {
    const viewer = await loadViewer();
    expect(viewer).toEqual({ state: "verified", displayName: profile.displayName, avatarSeed: profile.suggestion, unread: 3 });
    expect(JSON.stringify(viewer)).not.toContain(profile.email);
  });
  it("reads only the bounded unread count, never the notification list", async () => {
    mocks.notifications.mockResolvedValue(100);
    expect(await loadViewer()).toMatchObject({ state: "verified", unread: 100 });
    expect(mocks.notifications).toHaveBeenCalledExactlyOnceWith({}, "a".repeat(43));
  });
  it("is verified without a saved profile", async () => {
    mocks.profile.mockResolvedValue({ ...profile, displayName: null });
    expect(await loadViewer()).toMatchObject({ state: "verified", displayName: null });
  });
  it.each(["expired", "revoked"])("is anonymous after an authoritative %s rejection, with nothing logged", async () => {
    mocks.profile.mockRejectedValueOnce(new CommunityError(401));
    expect(await loadViewer()).toEqual({ state: "anonymous" });
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("is unavailable, not signed out, when the session check fails, and logs only a fixed event", async () => {
    mocks.profile.mockRejectedValueOnce(new Error("private diagnostics"));
    expect(await loadViewer()).toEqual({ state: "unavailable" });
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("shell.viewer.failed");
  });
  it("is unavailable for an installed but invalid identity context", async () => {
    mocks.requireIdentity.mockImplementationOnce(() => { throw new Error("Invalid context"); });
    expect(await loadViewer()).toEqual({ state: "unavailable" });
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("shell.viewer.failed");
  });
  it("keeps the header working with no count when only notifications fail", async () => {
    mocks.notifications.mockRejectedValueOnce(new Error("private diagnostics"));
    expect(await loadViewer()).toMatchObject({ state: "verified", unread: null });
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("shell.notifications.failed");
  });
  it("does not log a notification access rejection (for example too many memberships)", async () => {
    mocks.notifications.mockRejectedValueOnce(new CommunityError(429));
    expect(await loadViewer()).toMatchObject({ state: "verified", unread: null });
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("is anonymous when the session ends between the two reads", async () => {
    mocks.notifications.mockRejectedValueOnce(new CommunityError(401));
    expect(await loadViewer()).toEqual({ state: "anonymous" });
  });
});
