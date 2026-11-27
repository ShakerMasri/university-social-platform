import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellText } from "@/i18n/shell";
import { dictionaries } from "@/i18n/dictionaries";
import type { Viewer } from "./viewer";

const location = vi.hoisted(() => ({ pathname: "/en/communities", query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.query),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { ShellFrame } from "./shell-frame";
import { EntryFrame } from "./frame-parts";

const verified: Viewer = { state: "verified", displayName: "Synthetic أحمد", avatarSeed: "ABCDEF0123", unread: 4 };
/** The opening tag of the first link to `href`. */
const linkTag = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>`))?.[0] ?? "";
const render = (locale: "en" | "ar", viewer: Viewer) =>
  renderToStaticMarkup(createElement(ShellFrame, { locale, viewer, theme: null, children: createElement("p", null, "page body") }));

describe.each(["en", "ar"] as const)("%s shell frame", locale => {
  const text = shellText[locale];
  it("starts with a skip link to the focusable main landmark", () => {
    const html = render(locale, verified);
    expect(html.indexOf(dictionaries[locale].skipToContent)).toBeLessThan(html.indexOf("<header"));
    expect(html).toContain('href="#main-content"');
    expect(html).toMatch(/<main id="main-content" tabindex="-1"/);
  });
  it("offers Sign in, and no account controls or navigation, to an anonymous visitor", () => {
    const html = render(locale, { state: "anonymous" });
    expect(html).toContain(`href="/${locale}/signin"`);
    expect(html).not.toContain(text.account);
    expect(html).not.toContain(text.navigation);
    expect(html).not.toContain('role="search"');
  });
  it("shows neither Sign in nor account controls when the session could not be checked", () => {
    const html = render(locale, { state: "unavailable" });
    expect(html).not.toContain(`href="/${locale}/signin"`);
    expect(html).not.toContain(text.account);
    expect(html).not.toContain(`href="/${locale}/profile"`);
  });
  it("shows search, navigation, notifications with the unread count, and the account menu to a verified user", () => {
    location.pathname = `/${locale}/communities`;
    const html = render(locale, verified);
    expect(html).toContain('role="search"');
    expect(html).toContain(`action="/${locale}/search"`);
    expect(html).toContain(text.navigation);
    expect(html).toContain(text.mobileNavigation);
    expect(html).toContain(text.account);
    expect(html).toContain(text.notificationsUnread.replace("{count}", (4).toLocaleString(locale)));
    expect(html).not.toContain(`href="/${locale}/signin"`);
    expect(linkTag(html, `/${locale}/communities`)).toContain('aria-current="page"');
  });
  it("marks a section's inner page as current without calling it the page itself", () => {
    location.pathname = `/${locale}/communities/abc`;
    expect(linkTag(render(locale, verified), `/${locale}/communities`)).toContain('aria-current="true"');
  });
  it("links to the same page and query in the other language", () => {
    location.pathname = `/${locale}/search`; location.query = "q=pointers&tab=posts";
    const other = locale === "en" ? "ar" : "en";
    expect(render(locale, verified)).toContain(`href="/${other}/search?q=pointers&amp;tab=posts"`);
    location.query = "";
  });
  it("keeps the entry frame to brand, theme and language", () => {
    const html = renderToStaticMarkup(createElement(EntryFrame, { locale, theme: null, children: createElement("p", null, "page body") }));
    expect(html).toContain('href="#main-content"');
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain(text.navigation);
    expect(html).not.toContain(text.account);
    expect(html).not.toContain(`href="/${locale}/signin"`);
  });
});
