import { describe, expect, it, vi } from "vitest";
import { forwardedSearchHref, readSearchRequest, searchHref, searchSignature } from "./search-request";

vi.mock("server-only", () => ({}));
const report = vi.hoisted(() => vi.fn());
vi.mock("@/server/diagnostics", () => ({ reportOperationalFailure: report }));
import { searchFailure } from "./search-data";
import { CommunityError } from "@/server/communities/service";
import { InputError } from "@/server/communities/http";

const id = "abcdef12-3456-4789-abcd-ef1234567890";

describe("reading /search URLs", () => {
  it("defaults to the All tab with no query", () => {
    expect(readSearchRequest({})).toEqual({ tab: "all", query: "", duplicate: false });
  });
  it("reads the tab, query, filters and cursor", () => {
    expect(readSearchRequest({ tab: "posts", q: "pointers", community: id, type: "QUESTION", after: "x" }))
      .toEqual({ tab: "posts", query: "pointers", community: id, type: "QUESTION", after: "x", duplicate: false });
  });
  it("falls back to All for an unknown tab, including the Stage 2 Communities tab", () => {
    expect(readSearchRequest({ tab: "communities" }).tab).toBe("all");
    expect(readSearchRequest({ tab: "../admin" }).tab).toBe("all");
  });
  it("treats empty optional fields as unset", () => {
    expect(readSearchRequest({ q: "x", community: "", type: "" })).toEqual({ tab: "all", query: "x", duplicate: false });
  });
  it("flags repeated parameters instead of picking one", () => {
    const request = readSearchRequest({ q: ["a", "b"], tab: "posts" });
    expect(request.duplicate).toBe(true);
    expect(request.query).toBe("");
  });
});

describe("building /search links", () => {
  it("omits the default tab and empty values", () => {
    expect(searchHref("en", { tab: "all" })).toBe("/en/search");
    expect(searchHref("ar", { tab: "all", query: "مؤشرات" })).toBe(`/ar/search?q=${encodeURIComponent("مؤشرات")}`);
  });
  it("keeps filters for Posts only, and never a cursor on All", () => {
    expect(searchHref("en", { tab: "people", query: "a b", community: id, type: "QUESTION", after: "c" })).toBe("/en/search?tab=people&q=a+b&after=c");
    expect(searchHref("en", { tab: "posts", query: "q", community: id, type: "RESOURCE" })).toBe(`/en/search?tab=posts&q=q&community=${id}&type=RESOURCE`);
    expect(searchHref("en", { tab: "all", query: "q", after: "c" })).toBe("/en/search?q=q");
  });
  it("encodes characters that would otherwise change the URL", () => {
    expect(searchHref("en", { tab: "all", query: "a&tab=people#x" })).toBe("/en/search?q=a%26tab%3Dpeople%23x");
  });
  it("changes the focus signature only when results would change", () => {
    expect(searchSignature(readSearchRequest({}))).toBe("");
    expect(searchSignature(readSearchRequest({ q: "a" }))).not.toBe(searchSignature(readSearchRequest({ q: "a", tab: "posts" })));
  });
});

describe("old URLs forward to the matching tab", () => {
  it("keeps the archive query, community and type", () => {
    expect(forwardedSearchHref("en", "posts", { q: "ce101", community: id, type: "RESOURCE" })).toBe(`/en/search?tab=posts&q=ce101&community=${id}&type=RESOURCE`);
    expect(forwardedSearchHref("ar", "posts", { community: id })).toBe(`/ar/search?tab=posts&community=${id}`);
  });
  it("keeps the People query and drops everything else", () => {
    expect(forwardedSearchHref("en", "people", { q: "Ahmed", community: id, after: "x" })).toBe("/en/search?tab=people&q=Ahmed");
  });
  it("drops repeated and unknown parameters", () => {
    expect(forwardedSearchHref("en", "posts", { q: ["a", "b"], tab: "people", membership: "MEMBER" })).toBe("/en/search?tab=posts");
  });
});

describe("search failures", () => {
  it("maps service errors to page states, reporting only unexpected ones", () => {
    expect(searchFailure(new InputError("bad cursor"))).toBe("invalid");
    expect(searchFailure(new CommunityError(401))).toBe("signedOut");
    expect(searchFailure(new CommunityError(403))).toBe("unavailable");
    expect(searchFailure(new CommunityError(404))).toBe("unavailable");
    expect(searchFailure(new CommunityError(429))).toBe("rate");
    expect(report).not.toHaveBeenCalled();
    expect(searchFailure(new Error("private diagnostics"))).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("search.page.failed");
  });
});
