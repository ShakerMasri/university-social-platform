import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ read: vi.fn(), authorized: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => ({ value: "synthetic-session" }) }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); }, redirect: () => { throw new Error("Redirect"); } }));
vi.mock("@/server/identity/local", () => ({ requireLocalIdentity: () => ({ context: {} }), identityDatabase: () => ({}) }));
vi.mock("@/server/profiles/service", () => ({ readDirectoryProfile: mocks.read }));
vi.mock("@/server/communities/service", async original => ({ ...await original<typeof import("@/server/communities/service")>(), authorized: mocks.authorized }));
vi.mock("../messages/composer", () => ({ MessageComposer: ({ endpoint }: { endpoint: string }) => createElement("form", { "data-contact-endpoint": endpoint }) }));
import DirectoryProfilePage from "./[id]/page";

const ownId = "abcdef12-3456-4789-abcd-ef1234567890", otherId = "fedcba98-7654-4321-abcd-ef1234567890";
const variants = (id: string) => [id, id.toUpperCase(), id.replace(/[a-f]/, letter => letter.toUpperCase())];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockImplementation(async (_db, _token, run) => run({ profile: { findUnique: async () => ({ directoryId: ownId }) } }, "synthetic-actor"));
});
describe.each(["en", "ar"] as const)("%s canonical People identity", locale => {
  it.each(variants(ownId))("omits self-contact controls for own profile URL %s", async id => {
    mocks.read.mockResolvedValue({ id: ownId, displayName: "Own synthetic profile" });
    const html = renderToStaticMarkup(await DirectoryProfilePage({ params: Promise.resolve({ locale, id }) }));
    expect(html).toContain("Own synthetic profile"); expect(html).not.toContain("data-contact-endpoint");
  });
  it("keeps eligible other-profile contact and its endpoint canonical for mixed-case URLs", async () => {
    mocks.read.mockResolvedValue({ id: otherId, displayName: "Other synthetic profile" });
    const html = renderToStaticMarkup(await DirectoryProfilePage({ params: Promise.resolve({ locale, id: otherId.toUpperCase() }) }));
    expect(html).toContain(`data-contact-endpoint="/api/people/${otherId}/messages"`);
  });
});
