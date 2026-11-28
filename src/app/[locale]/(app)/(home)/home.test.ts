import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { identityText } from "@/i18n/identity";
import { shellText } from "@/i18n/shell";
import { homeText } from "@/i18n/home";
import { feedText } from "@/i18n/feed";
import type { Viewer } from "@/app/[locale]/shell/viewer";

type FeedViewer = { state: "ready"; viewer: string } | { state: "signed-out" } | { state: "failed" };
const mocks = vi.hoisted(() => ({ viewer: { state: "anonymous" } as Viewer, feed: { state: "failed" } as FeedViewer, feedCalls: 0 }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("Not found"); },
  redirect: (href: string) => { throw new Error(`Redirect ${href}`); },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/[locale]/shell/viewer", () => ({ loadViewer: async () => mocks.viewer }));
vi.mock("../feed/feed-viewer", () => ({ loadFeedViewer: async () => { mocks.feedCalls++; return mocks.feed; } }));
import Home from "./page";

const verified: Viewer = { state: "verified", displayName: "Synthetic طالب", avatarSeed: "ABCDEF0123", unread: 0 };
beforeEach(() => { vi.clearAllMocks(); mocks.viewer = { state: "anonymous" }; mocks.feed = { state: "failed" }; mocks.feedCalls = 0; });

describe.each(["en", "ar"] as const)("%s home page", locale => {
  const render = async (searchParams: Record<string, string | string[]> = {}) =>
    renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams) }));
  it("offers sign-in to an anonymous visitor, without reading the feed", async () => {
    const html = await render();
    expect(html).toContain(`href="/${locale}/signin"`);
    expect(html).toContain(shellText[locale].landingSignIn);
    expect(mocks.feedCalls).toBe(0);
  });
  it("shows the composer and feed tabs to a verified user, with the current tab marked", async () => {
    mocks.viewer = verified; mocks.feed = { state: "ready", viewer: "a".repeat(64) };
    const html = await render({ tab: "for-you" });
    expect(html).toContain(homeText[locale].startPost);
    expect(html).toContain(`href="/${locale}"`);
    expect(html).toContain(`aria-current="page" href="/${locale}?tab=for-you"`);
    expect(html).not.toContain(`href="/${locale}/signin"`);
  });
  it("asks a verified user without a display name to add one before posting", async () => {
    mocks.viewer = { ...verified, displayName: null }; mocks.feed = { state: "ready", viewer: "a".repeat(64) };
    const html = await render();
    expect(html).toContain(homeText[locale].needName);
    expect(html).toContain(`href="/${locale}/profile"`);
  });
  it("shows a feed failure without hiding the rest of Home", async () => {
    mocks.viewer = verified; mocks.feed = { state: "failed" };
    const html = await render();
    expect(html).toContain(feedText[locale].failed);
    expect(html).toContain(homeText[locale].startPost);
  });
  it("sends a session that ended meanwhile to sign-in", async () => {
    mocks.viewer = verified; mocks.feed = { state: "signed-out" };
    await expect(render()).rejects.toThrow(`Redirect /${locale}/signin`);
  });
  it("redirects an unknown tab to plain Home", async () => {
    for (const tab of ["x", "communities", ["for-you", "for-you"]]) await expect(render({ tab })).rejects.toThrow(`Redirect /${locale}`);
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
