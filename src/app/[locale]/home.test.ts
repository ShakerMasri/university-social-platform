import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { identityText } from "@/i18n/identity";
import { communityText } from "@/i18n/communities";

const mocks = vi.hoisted(() => ({
  token: undefined as string | undefined,
  enabled: true,
  requireIdentity: vi.fn(), database: vi.fn(), authorized: vi.fn(), report: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/identity/local", () => ({
  localIdentity: () => mocks.enabled ? {} : undefined,
  requireLocalIdentity: mocks.requireIdentity, identityDatabase: mocks.database,
}));
vi.mock("@/server/communities/service", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/communities/service")>();
  return { ...original, authorized: mocks.authorized };
});
vi.mock("@/server/diagnostics", () => ({ reportOperationalFailure: mocks.report }));
import Home from "./page";
import { CommunityError } from "@/server/communities/service";

beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true; mocks.token = "a".repeat(43);
  mocks.requireIdentity.mockReturnValue({ context: {} }); mocks.database.mockReturnValue({});
  mocks.authorized.mockImplementation(async (_db, _token, run) => run());
});

describe.each(["en", "ar"] as const)("%s homepage session projection", locale => {
  const render = async () => renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
  it("offers sign-in without querying the database for an anonymous visitor", async () => {
    mocks.token = undefined;
    const html = await render();
    expect(html).toContain(`href="/${locale}/signin"`);
    expect(html).toContain(identityText[locale].signIn);
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("shows account navigation and Communities for a verified session without requiring a saved profile", async () => {
    const html = await render();
    expect(html).toContain(`href="/${locale}/communities"`);
    expect(html).toContain(communityText[locale].title);
    expect(html).toContain(`href="/${locale}/profile"`);
    expect(html).not.toContain(`href="/${locale}/signin"`);
    expect(mocks.authorized).toHaveBeenCalledWith({}, mocks.token, expect.any(Function));
  });
  it.each(["expired", "revoked"])("offers sign-in after authoritative %s rejection", async () => {
    mocks.authorized.mockRejectedValueOnce(new CommunityError(401));
    expect(await render()).toContain(`href="/${locale}/signin"`);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("shows a temporary failure with no false sign-out and logs no credentials", async () => {
    mocks.authorized.mockRejectedValueOnce(new Error("private diagnostics"));
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(`href="/${locale}/signin"`);
    expect(html).not.toContain(`href="/${locale}/profile"`);
    expect(html).not.toContain("private diagnostics");
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("identity.home.failed");
  });
  it("leaves ordinary startup disabled even with a well-formed session cookie", async () => {
    mocks.enabled = false;
    expect(await render()).toContain(`href="/${locale}/signin"`);
    expect(mocks.requireIdentity).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("does not treat an invalid installed identity context as signed out", async () => {
    mocks.requireIdentity.mockImplementationOnce(() => { throw new Error("Invalid context"); });
    expect(await render()).toContain('role="alert"');
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("identity.home.failed");
  });
});
