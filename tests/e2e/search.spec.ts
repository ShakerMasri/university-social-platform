import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { archiveText } from "../../src/i18n/archive";
import { peopleText } from "../../src/i18n/people";
import { postText } from "../../src/i18n/posts";
import { searchText } from "../../src/i18n/search";
import { shellText } from "../../src/i18n/shell";
import { uiText } from "../../src/i18n/ui";

// UI rebuild Stage 1, plan C1: unified search. Results render on the server
// from the URL, so each case checks what a fresh render shows after access
// changes. Replaces the archive and People search pages' browser cases (see
// the Stage 1 security case inventory in docs/plans/ui-redesign.md).
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const locales = ["en", "ar"] as const;
const write = (request: APIRequestContext, path: string, data: object) => request.post(path, { data, headers: { Origin: origin } });

async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable search browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic search fixture failed; private diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });

async function signIn(context: BrowserContext, displayName: string | null = "دارس Search") {
  const email = `search.${randomUUID()}@university.test`;
  expect((await write(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await write(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (displayName) expect((await write(context.request, "/api/identity/profile", { displayName })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function space(request: APIRequestContext, visibility: "PUBLIC" | "PRIVATE" = "PRIVATE") {
  const response = await write(request, "/api/communities", { name: `Search ${randomUUID()}`, description: "", visibility });
  expect(response.status()).toBe(201); return (await response.json()).id as string;
}
async function post(request: APIRequestContext, community: string, title: string, type = "DISCUSSION", body = "Synthetic explanation") {
  const response = await write(request, `/api/communities/${community}/posts`, { requestId: randomUUID(), type, title, body });
  expect(response.status()).toBe(201); return (await response.json()).id as string;
}
async function seedPosts(community: string, author: string, marker: string, count = 23) {
  const ids = Array.from({ length: count }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Post" (id,"communityId","authorId",type,title,body) SELECT id,$2::uuid,$3::uuid,\'QUESTION\',$4,\'Private synthetic excerpt\' FROM unnest($1::uuid[]) id', [ids, community, author, marker]));
  return ids;
}
const postResults = (page: Page) => page.locator('[data-search-result="post"]');
const peopleResults = (page: Page) => page.locator('[data-search-result="person"]');
const resultsHeading = (page: Page, locale: "en" | "ar") => page.getByRole("heading", { name: searchText[locale].results, exact: true });
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("C1/A6: private posts reach only current members, through pages, cursors and removal", async ({ context, browser }) => {
  const ownerId = await signIn(context), community = await space(context.request), marker = `private${randomUUID().slice(0, 8)}`;
  const ids = await seedPosts(community, ownerId, marker);
  const comment = await write(context.request, `/api/communities/${community}/posts/${ids[0]}/comments`, { requestId: randomUUID(), body: marker });
  expect(comment.status()).toBe(201); const commentId = (await comment.json()).id as string;
  const reader = await browser.newContext({ baseURL: origin });
  try {
    const readerId = await signIn(reader, "Reader قارئ"), page = await reader.newPage(), text = archiveText.en;
    // Not a member: no post on All or Posts, and a scoped search is denied.
    await page.goto(`/en/search?q=${marker}`);
    await expect(postResults(page)).toHaveCount(0);
    await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
    await page.goto(`/en/search?tab=posts&q=${marker}`);
    await expect(postResults(page)).toHaveCount(0);
    await page.goto(`/en/search?tab=posts&q=${marker}&community=${community}`);
    await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
    await expect(page.locator("#search-community")).toHaveCount(0);
    // A pending request is not membership.
    expect((await write(reader.request, `/api/communities/${community}/memberships`, { action: "join" })).status()).toBe(200);
    await page.reload();
    await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "approve", userId: readerId })).status()).toBe(200);
    // A member sees them: five on All with See all, then 20 + 3 on Posts.
    await page.goto(`/en/search?q=${marker}`);
    await expect(postResults(page)).toHaveCount(5);
    await page.getByRole("link", { name: searchText.en.seeAllPosts, exact: true }).click();
    await expect(page).toHaveURL(`${origin}/en/search?tab=posts&q=${marker}`);
    await expect(postResults(page)).toHaveCount(20);
    const next = page.getByRole("link", { name: text.next, exact: true });
    const nextHref = await next.getAttribute("href");
    await next.click();
    await expect(postResults(page)).toHaveCount(3);
    await expect(page.getByRole("link", { name: searchText.en.firstResults, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: text.next, exact: true })).toHaveCount(0);
    // Another user's cursor is refused as "start a new search".
    const ownerPage = await context.newPage();
    await ownerPage.goto(nextHref!);
    await expect(ownerPage.getByText(text.invalid, { exact: true })).toBeVisible();
    await expect(postResults(ownerPage)).toHaveCount(0);
    await ownerPage.close();
    // After removal: a reload clears the results, the cursor is denied, the
    // community leaves the filter and direct links to the reply are denied.
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "remove", userId: readerId })).status()).toBe(200);
    await page.reload();
    await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
    await expect(postResults(page)).toHaveCount(0);
    await page.goto(`/en/search?tab=posts&q=${marker}`);
    await expect(postResults(page)).toHaveCount(0);
    await expect(page.locator(`#search-community option[value="${community}"]`)).toHaveCount(0);
    await page.goto(`/en/search?q=${marker}`);
    await expect(postResults(page)).toHaveCount(0);
    await page.goto(`/en/communities/${community}/posts/${ids[0]}?comment=${commentId}`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(postText.en.unavailable);
    await page.goto(`/en/communities/${community}/posts/${ids[1]}?comment=${commentId}`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(postText.en.unavailable);
  } finally { await reader.close(); }
});

test("A6/A7: archive API keeps its private pagination, cursor binding and input bounds", async ({ context, browser }) => {
  const ownerId = await signIn(context), community = await space(context.request), marker = `api${randomUUID().slice(0, 8)}`;
  await seedPosts(community, ownerId, marker);
  const reader = await browser.newContext({ baseURL: origin });
  try {
    const readerId = await signIn(reader, null);
    const endpoint = `/api/archive?${new URLSearchParams({ q: marker, community })}`;
    expect((await reader.request.get(endpoint)).status()).toBe(404);
    expect((await (await reader.request.get(`/api/archive?q=${marker}`)).json()).items).toEqual([]);
    expect((await write(reader.request, `/api/communities/${community}/memberships`, { action: "join" })).status()).toBe(200);
    expect((await reader.request.get(endpoint)).status()).toBe(404);
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "approve", userId: readerId })).status()).toBe(200);
    const result = await reader.request.get(endpoint);
    expect(result.headers()["cache-control"]).toBe("private, no-store");
    const first = await result.json(); expect(first.items).toHaveLength(20);
    expect((await context.request.get(`${endpoint}&after=${first.next}`)).status()).toBe(400);
    const second = await (await reader.request.get(`${endpoint}&after=${first.next}`)).json();
    expect(second.items).toHaveLength(3); expect(second.next).toBeNull();
    expect((await write(context.request, `/api/communities/${community}/memberships`, { action: "remove", userId: readerId })).status()).toBe(200);
    expect((await reader.request.get(`${endpoint}&after=${first.next}`)).status()).toBe(404);
  } finally { await reader.close(); }
  for (const params of ["q=test&q=other", "q=test&membership=MEMBER", `q=${"x".repeat(201)}`, "q=%25", "q=test&type=INVALID"]) {
    expect((await context.request.get(`/api/archive?${params}`)).status()).toBe(400);
  }
  expect((await context.request.post("/api/archive", { data: { q: "test" } })).status()).toBe(405);
  expect((await context.request.get("/api/archive?q=literal%25_noMatch")).status()).toBe(200);
});

for (const locale of locales) {
  const text = searchText[locale], archive = archiveText[locale];

  test(`${locale}: keyboard search, filters, cross-year results and a deep reply link at 320px`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request);
    const discussion = await post(context.request, community, "CE101 نقاش المؤشرات", "DISCUSSION", "مُـؤَشِّرَات شرح دراسي");
    const resource = await post(context.request, community, "CE101 مورد المؤشرات", "RESOURCE", "مُـؤَشِّرَات شرح دراسي");
    await fixture(client => client.query('UPDATE "Post" SET "createdAt"=$1 WHERE id=$2', ["2024-03-10T12:00:00Z", discussion]));
    const root = await write(context.request, `/api/communities/${community}/posts/${discussion}/comments`, { requestId: randomUUID(), body: "Original context" });
    const reply = await write(context.request, `/api/communities/${community}/posts/${discussion}/comments`, { requestId: randomUUID(), replyToId: (await root.json()).id, body: "pipeline hazards explanation" });
    expect(reply.status()).toBe(201); const replyId = (await reply.json()).id as string;
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/${locale}/search?tab=posts&community=${community}`);
    await expect(page.getByText(text.postsPrompt, { exact: true })).toBeVisible();
    await expect(page.locator("#search-community")).toHaveValue(community);
    const query = page.getByLabel(text.query, { exact: true });
    await query.fill("ce101 مؤشرات"); await query.press("Enter");
    await expect(postResults(page)).toHaveCount(2);
    await expect(resultsHeading(page, locale)).toBeFocused();
    await expect(postResults(page).first().getByRole("link")).toHaveAttribute("href", new RegExp(resource));
    expect(await postResults(page).locator("time").last().getAttribute("datetime")).toContain("2024");
    await page.getByLabel(postText[locale].type, { exact: true }).selectOption("RESOURCE");
    await page.getByRole("button", { name: text.submit, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/type=RESOURCE/);
    await expect(postResults(page)).toHaveCount(1);
    await page.getByLabel(postText[locale].type, { exact: true }).selectOption("");
    await query.fill("pipeline hazards"); await query.press("Enter");
    await expect(page.getByText(archive.commentMatch, { exact: true })).toBeVisible();
    await fits(page);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await postResults(page).getByRole("link").click();
    await expect(page.locator(`#comment-${replyId}`)).toBeFocused();
    await expect(page.locator(`#comment-${replyId}`)).toContainText("pipeline hazards explanation");
    await page.goto(`/${locale}/search?tab=posts&q=missing${randomUUID().slice(0, 8)}`);
    await expect(page.getByText(archive.empty, { exact: true })).toBeVisible();
  });

  test(`${locale}: header search opens All, tabs keep the query, and invalid queries explain why per kind`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request, "PUBLIC"), marker = `tabs${randomUUID().slice(0, 8)}`;
    await post(context.request, community, `${marker} topic`);
    await page.goto(`/${locale}/communities`);
    const header = page.getByRole("searchbox", { name: shellText[locale].searchLabel, exact: true });
    await header.fill(marker); await header.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/search?q=${marker}`);
    await expect(resultsHeading(page, locale)).toBeFocused();
    await expect(header).toHaveValue(marker);
    const tabs = page.getByRole("navigation", { name: text.tabsLabel, exact: true });
    await expect(tabs.getByRole("link", { name: text.all, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(postResults(page)).toHaveCount(1);
    await tabs.getByRole("link", { name: text.people, exact: true }).click();
    await expect(page).toHaveURL(`${origin}/${locale}/search?tab=people&q=${marker}`);
    await expect(tabs.getByRole("link", { name: text.people, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel(text.query, { exact: true })).toHaveValue(marker);
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/${locale}/search?q=${marker}`);
    // One character: both kinds reject it, each with its own reason.
    await page.goto(`/${locale}/search?q=x`);
    await expect(page.getByText(text.postsInvalid, { exact: true })).toBeVisible();
    await expect(page.getByText(text.peopleInvalid, { exact: true })).toBeVisible();
    // Long enough for posts, too long for people: posts still search.
    await page.goto(`/${locale}/search?q=${encodeURIComponent(`${marker} ${"x".repeat(60)}`)}`);
    await expect(page.getByText(text.peopleInvalid, { exact: true })).toBeVisible();
    await expect(page.getByText(text.postsInvalid, { exact: true })).toHaveCount(0);
    // Counts are never shown.
    await page.goto(`/${locale}/search?q=${marker}`);
    await expect(page.getByRole("main")).not.toContainText(/\b1\b.*(result|نتيجة)/);
  });

  test(`${locale}: stored markup in titles, bodies and names renders as text`, async ({ context, page }) => {
    const userId = await signIn(context);
    const community = await space(context.request, "PUBLIC"), marker = `inert${randomUUID().slice(0, 8)}`;
    await post(context.request, community, `<img src=x onerror=window.searchXSS=1> ${marker}`, "DISCUSSION", "<script>window.searchXSS=1</script>");
    await fixture(client => client.query('UPDATE "Profile" SET "displayName"=$2 WHERE "userId"=$1', [userId, `<svg onload=window.searchXSS=1> ${marker}`]));
    await page.goto(`/${locale}/search?q=${marker}`);
    await expect(postResults(page)).toHaveCount(1);
    await expect(peopleResults(page)).toHaveCount(1);
    await expect(page.locator("[data-search-result] img, [data-search-result] script, [data-search-result] svg[onload]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { searchXSS?: number }).searchXSS)).toBeUndefined();
  });

  test(`${locale}: People tab finds saved, verified profiles, pages, and drops unverified ones`, async ({ context, page, browser }) => {
    await signIn(context); const marker = randomUUID().slice(0, 8);
    const owner = await browser.newContext({ baseURL: origin }), hidden = await browser.newContext({ baseURL: origin });
    try {
      await signIn(owner, `${marker} أَحْـمَد Ahmed Mahmoud`); await signIn(hidden, null);
      await page.goto(`/${locale}/search?tab=people&q=${encodeURIComponent(`Mahmoud ${marker} Ahmde`)}`);
      await expect(peopleResults(page)).toHaveCount(1);
      const link = peopleResults(page).getByRole("link"), destination = (await link.getAttribute("href"))!;
      await page.goto(`/${locale}/search?tab=people&q=${encodeURIComponent(`${marker} أحدم`)}`);
      await expect(peopleResults(page).getByRole("link")).toHaveAttribute("href", destination);
      await peopleResults(page).getByRole("link").click();
      await expect(page.getByRole("heading", { name: `${marker} أَحْـمَد Ahmed Mahmoud`, exact: true })).toBeVisible();
      const directoryId = destination.split("/").at(-1)!;
      await fixture(client => client.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=(SELECT "userId" FROM "Profile" WHERE "directoryId"=$1)', [directoryId]));
      await page.goto(`/${locale}/search?tab=people&q=${encodeURIComponent(`${marker} Ahmde`)}`);
      await expect(peopleResults(page)).toHaveCount(0);
      await expect(page.getByText(peopleText[locale].empty, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: peopleText[locale].settings, exact: true })).toHaveAttribute("href", `/${locale}/profile`);
      expect((await context.request.get(`/api/people/${directoryId}`)).status()).toBe(404);
      // Pagination: 23 matching profiles give 20, then 3.
      await fixture(async client => {
        for (let i = 0; i < 23; i++) {
          const id = randomUUID();
          await client.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, `${id}@university.test`]);
          await client.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") VALUES ($1,$2,true,now())', [id, `Paged ${marker}`]);
        }
      });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`/${locale}/search?tab=people&q=${encodeURIComponent(`paged ${marker}`)}`);
      await expect(peopleResults(page)).toHaveCount(20); await fits(page);
      await page.getByRole("link", { name: peopleText[locale].next, exact: true }).click();
      await expect(peopleResults(page)).toHaveCount(3);
    } finally { await owner.close(); await hidden.close(); }
  });

  test(`${locale}: old archive and People links land on the matching tab with the same results`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request), marker = `redirect${randomUUID().slice(0, 8)}`;
    await post(context.request, community, `${marker} resource`, "RESOURCE");
    const archived = await page.goto(`/${locale}/archive?q=${marker}&community=${community}&type=RESOURCE`);
    expect(archived?.request().redirectedFrom()?.url()).toContain("/archive");
    await expect(page).toHaveURL(`${origin}/${locale}/search?tab=posts&q=${marker}&community=${community}&type=RESOURCE`);
    await expect(postResults(page)).toHaveCount(1);
    await page.goto(`/${locale}/archive?community=${community}`);
    await expect(page).toHaveURL(`${origin}/${locale}/search?tab=posts&community=${community}`);
    await page.goto(`/${locale}/people?q=${marker}`);
    await expect(page).toHaveURL(`${origin}/${locale}/search?tab=people&q=${marker}`);
    const response = await context.request.get(`/${locale}/archive?q=${marker}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
  });

  test(`${locale}: a failed kind offers Retry while the other kind still shows, and an unchecked session shows neither`, async ({ context, page }) => {
    await signIn(context); const community = await space(context.request, "PUBLIC"), marker = `fault${randomUUID().slice(0, 8)}`, text = searchText[locale];
    await post(context.request, community, `${marker} topic`);
    expect((await context.request.put("/api/people/profile", { data: { displayName: `Search ${marker}` }, headers: { Origin: origin } })).status()).toBe(200);
    const role = readManifest().runtimeRole;
    const posts = page.getByRole("region", { name: text.posts, exact: true }), people = page.getByRole("region", { name: text.people, exact: true });
    // A genuine database fault that only post search meets (it reads comments).
    await fixture(client => client.query(`REVOKE SELECT ON "Comment" FROM "${role}"`));
    try {
      await page.goto(`/${locale}/search?q=${marker}`);
      await expect(posts.getByRole("heading", { name: archiveText[locale].failed, exact: true })).toBeVisible();
      await expect(postResults(page)).toHaveCount(0);
      await expect(people.getByRole("heading", { name: archiveText[locale].failed, exact: true })).toHaveCount(0);
      await expect(peopleResults(page)).toHaveCount(1);
    } finally { await fixture(client => client.query(`GRANT SELECT ON "Comment" TO "${role}"`)); }
    await posts.getByRole("link", { name: uiText[locale].retry, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(postResults(page)).toHaveCount(1);
    await expect(peopleResults(page)).toHaveCount(1);
    // The session itself cannot be checked: no results and no sign-in redirect.
    await fixture(client => client.query(`REVOKE SELECT ON "Session" FROM "${role}"`));
    try {
      await page.reload();
      await expect(page).toHaveURL(`${origin}/${locale}/search?q=${marker}`);
      await expect(page.getByRole("main").getByRole("heading", { name: archiveText[locale].failed, exact: true })).toBeVisible();
      await expect(postResults(page)).toHaveCount(0); await expect(peopleResults(page)).toHaveCount(0);
    } finally { await fixture(client => client.query(`GRANT SELECT ON "Session" TO "${role}"`)); }
  });

  test(`${locale}: tabs work from the keyboard, and only the Posts tab applies post filters`, async ({ context, page }) => {
    await signIn(context); const scoped = await space(context.request, "PUBLIC"), other = await space(context.request, "PUBLIC"), marker = `scope${randomUUID().slice(0, 8)}`, text = searchText[locale];
    await post(context.request, scoped, `${marker} scoped`); await post(context.request, other, `${marker} elsewhere`);
    // A filter in an All-tab link is ignored: All shows what "See all posts" shows.
    await page.goto(`/${locale}/search?q=${marker}&community=${scoped}`);
    await expect(postResults(page)).toHaveCount(2);
    const tabs = page.getByRole("navigation", { name: text.tabsLabel, exact: true });
    await tabs.getByRole("link", { name: text.posts, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/search?tab=posts&q=${marker}&community=${scoped}`);
    await expect(tabs.getByRole("link", { name: text.posts, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(resultsHeading(page, locale)).toBeFocused();
    await expect(postResults(page)).toHaveCount(1);
    await tabs.getByRole("link", { name: text.all, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(tabs.getByRole("link", { name: text.all, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(postResults(page)).toHaveCount(2);
  });

  test(`${locale}: signed-out visitors are sent to sign in, and a sign-out mid-search shows nothing`, async ({ context, page, browser }) => {
    const anonymous = await browser.newContext({ baseURL: origin });
    try {
      const other = await anonymous.newPage(); await other.goto(`/${locale}/search?q=anything`);
      await expect(other).toHaveURL(`${origin}/${locale}/signin`);
    } finally { await anonymous.close(); }
    await signIn(context); const marker = `signout${randomUUID().slice(0, 8)}`;
    expect((await context.request.put("/api/people/profile", { data: { displayName: `Search ${marker}` }, headers: { Origin: origin } })).status()).toBe(200);
    await page.goto(`/${locale}/search?tab=people&q=${marker}`);
    await expect(peopleResults(page)).toHaveCount(1);
    await write(context.request, "/api/identity/logout", {});
    await page.reload();
    await expect(page).toHaveURL(`${origin}/${locale}/signin`);
    await expect(peopleResults(page)).toHaveCount(0);
  });
}
