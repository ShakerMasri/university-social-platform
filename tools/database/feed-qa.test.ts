import { describe, expect, it } from "vitest";
import { feedQaAccounts, feedQaCommunities, feedQaExpected, feedQaMemberships, feedQaPosts } from "../testing/feed-qa-fixture.mts";
import { permitsOfflineInterfaces } from "../testing/feed-qa-guest.mts";
import { allowedFeedSnapshotPath } from "../testing/feed-qa-snapshot.mts";

describe("manual feed fixture data", () => {
  it("preserves the independently specified page orders, timestamp edges and viewer permissions", () => {
    const pages = (alias: string, forYou: boolean) => {
      const joined = new Set(feedQaMemberships.filter(row => row.account === alias).map(row => row.community));
      const publicSpaces = new Set<string>(feedQaCommunities.filter(row => row.visibility === "PUBLIC").map(row => row.code));
      const rank = (row: typeof feedQaPosts[number]) =>
        Date.parse(row.createdAt) + (forYou && joined.has(row.community) ? 259200000 : 0);
      const visible = feedQaPosts.filter(row => joined.has(row.community) || (forYou && publicSpaces.has(row.community)))
        .sort((a, b) => rank(b) - rank(a) || (a.id < b.id ? 1 : -1)).map(row => row.code);
      return visible.length > 20 ? [visible.slice(0, 20), visible.slice(20)] : [visible];
    };
    expect(pages("R", true)).toEqual(feedQaExpected.readerForYou);
    expect(pages("R", false)).toEqual(feedQaExpected.readerCommunities);
    expect(pages("N", true)).toEqual(feedQaExpected.newcomerForYou);
    expect(pages("N", false)).toEqual(feedQaExpected.newcomerCommunities);
    expect(feedQaPosts).toHaveLength(31);
    expect(new Set(feedQaPosts.map(row => row.id)).size).toBe(31);
    expect(new Set(feedQaPosts.map(row => row.type))).toEqual(new Set(["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"]));
    expect(feedQaPosts.find(row => row.code === "J21")?.author).toBe("R");
    expect(feedQaAccounts.filter(row => row.name === null).map(row => row.alias)).toEqual(["N", "L"]);
  });
});

describe("feed QA isolation inputs", () => {
  it("permits down guest links and its default bridge but rejects an active or addressed external link", () => {
    const base = [{ ifname: "lo", flags: ["LOWER_UP"] }, { ifname: "docker0", flags: ["LOWER_UP"] },
      { ifname: "veth123a", flags: ["LOWER_UP"], master: "docker0" }, { ifname: "ens33", flags: ["UP"] }];
    expect(permitsOfflineInterfaces(base)).toBe(true);
    expect(permitsOfflineInterfaces([...base, { ifname: "ens34", flags: ["LOWER_UP"] }])).toBe(false);
    expect(permitsOfflineInterfaces([...base, { ifname: "ens34", flags: [], addr_info: [{}] }])).toBe(false);
    expect(permitsOfflineInterfaces([...base, { ifname: "veth456", flags: ["LOWER_UP"], master: "br-other" }])).toBe(false);
    expect(permitsOfflineInterfaces([])).toBe(false);
  });
  it("rejects excluded paths even when nested or written in different case", () => {
    expect(allowedFeedSnapshotPath("src/app/[locale]/feed/for-you/page.tsx")).toBe(true);
    for (const path of ["../secret", ".cache/m1b/manifest.json", "docs/.Env.production", ".git/config", "data.sqlite",
      ".AWS/credentials", "src//post.ts", "/etc/passwd", "tools\\other.ts", "test/private.PEM", "docs/backup.dump"]) {
      expect(allowedFeedSnapshotPath(path)).toBe(false);
    }
  });
});
