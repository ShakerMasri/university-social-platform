import { describe, expect, it } from "vitest";
import { feedRedirectHref, homeHref, readHomeTab } from "./home-href";

describe("Home feed tabs", () => {
  it("reads the two tabs and rejects anything else", () => {
    expect(readHomeTab({})).toBe("communities");
    expect(readHomeTab({ tab: "for-you", other: "kept" })).toBe("for-you");
    for (const tab of ["", "communities", "FOR-YOU", "feed"]) expect(readHomeTab({ tab })).toBeNull();
    expect(readHomeTab({ tab: ["for-you", "for-you"] })).toBeNull();
  });
  it("links to each tab", () => {
    expect(homeHref("en")).toBe("/en");
    expect(homeHref("ar", "for-you")).toBe("/ar?tab=for-you");
  });
});

describe("old feed links", () => {
  it("land on Home with every query parameter kept", () => {
    expect(feedRedirectHref("en", {}, false)).toBe("/en");
    expect(feedRedirectHref("ar", { notification: "abc", q: "قانون أوم" }, false)).toBe(`/ar?notification=abc&q=${encodeURIComponent("قانون أوم").replace(/%20/g, "+")}`);
    expect(feedRedirectHref("en", { a: ["1", "2"], b: undefined }, false)).toBe("/en?a=1&a=2");
  });
  it("open For you from /feed/for-you, replacing any tab value", () => {
    expect(feedRedirectHref("en", {}, true)).toBe("/en?tab=for-you");
    expect(feedRedirectHref("en", { tab: "x", notification: "n" }, true)).toBe("/en?notification=n&tab=for-you");
  });
});
