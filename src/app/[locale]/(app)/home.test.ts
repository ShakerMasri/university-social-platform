import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { identityText } from "@/i18n/identity";
import { shellText } from "@/i18n/shell";
import type { Viewer } from "@/app/[locale]/shell/viewer";

const mocks = vi.hoisted(() => ({ viewer: { state: "anonymous" } as Viewer }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/shell/viewer", () => ({ loadViewer: async () => mocks.viewer }));
import Home from "./page";

beforeEach(() => { vi.clearAllMocks(); mocks.viewer = { state: "anonymous" }; });

describe.each(["en", "ar"] as const)("%s home page", locale => {
  const render = async () => renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
  it("offers sign-in to an anonymous visitor", async () => {
    const html = await render();
    expect(html).toContain(`href="/${locale}/signin"`);
    expect(html).toContain(shellText[locale].landingSignIn);
  });
  it("shows the start links, and no sign-in, to a verified user without a saved profile", async () => {
    mocks.viewer = { state: "verified", displayName: null, avatarSeed: "ABCDEF0123", unread: 0 };
    const html = await render();
    expect(html).toContain(`href="/${locale}/feed"`);
    expect(html).toContain(`href="/${locale}/communities"`);
    expect(html).not.toContain(`href="/${locale}/signin"`);
  });
  it("shows a failure with no false sign-out when the session could not be checked", async () => {
    mocks.viewer = { state: "unavailable" };
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain(identityText[locale].homeUnavailable);
    expect(html).toContain(`href="/${locale}"`);
    expect(html).not.toContain(`href="/${locale}/signin"`);
    expect(html).not.toContain(`href="/${locale}/profile"`);
  });
});
