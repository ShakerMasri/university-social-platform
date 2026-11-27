import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { peopleText } from "../../src/i18n/people";
import { identityText } from "../../src/i18n/identity";
import { digest, newToken, sessionCookie } from "../../src/server/identity/policy";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable people browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic people fixture failed; private diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
async function signIn(context: BrowserContext) {
  const email = `people.${randomUUID()}@university.test`;
  expect((await context.request.post("/api/identity/request", { data: { email, locale: "en" }, headers: { Origin: origin } })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await context.request.post("/api/identity/confirm", { data: { token, locale: "en" }, headers: { Origin: origin } })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id);
}
async function save(context: BrowserContext, displayName: string) {
  const response = await context.request.put("/api/people/profile", { data: { displayName }, headers: { Origin: origin } });
  expect(response.status()).toBe(200);
}
// The People search page is now the People tab of /search; its UI cases live
// in search.spec.ts. This file keeps the profile, directory API and matching
// regressions. Results render on the server, so a search is a URL.
const results = (page: Page) => page.locator('[data-search-result="person"]');
async function searchPeople(page: Page, locale: "en" | "ar", query: string) {
  await page.goto(`/${locale}/search?tab=people&q=${encodeURIComponent(query)}`);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: Unicode-number typos respect whole words, partial matching and saved profiles`, async ({ context, page, browser }) => {
    const owner = await browser.newContext(), hidden = await browser.newContext(), marker = randomUUID().slice(0, 8);
    const displayName = `${marker} a³a`;
    try {
      await signIn(context); await signIn(owner); await signIn(hidden);
      await save(owner, displayName); // The other account has no saved profile.
      await searchPeople(page, locale, `${marker} a²a`);
      await expect(results(page)).toHaveCount(1);
      await expect(results(page).getByRole("link", { name: displayName, exact: true })).toBeVisible();
      await save(owner, `${marker} ab²zz`);
      await searchPeople(page, locale, `${marker} abc`);
      await expect(results(page)).toHaveCount(0);
      await expect(page.getByText(peopleText[locale].empty, { exact: true })).toBeVisible();
      await searchPeople(page, locale, `${marker} ²z`);
      await expect(results(page)).toHaveCount(1);
    } finally { await owner.close(); await hidden.close(); }
  });
  test(`${locale}: saves a generated label, is found without shared membership and offers no hiding control`, async ({ context, page, browser }) => {
    const id = await signIn(context), other = await browser.newContext(), text = peopleText[locale];
    try {
      await signIn(other); await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`/${locale}/profile`);
      const input = page.getByLabel(identityText[locale].name, { exact: true });
      const suggestion = await input.inputValue(); expect(suggestion).toMatch(new RegExp(`^${text.suggestion} [0-9A-F]{10}$`));
      await expect(page.getByText(text.directoryHint, { exact: true })).toBeVisible();
      await expect(page.getByRole("checkbox")).toHaveCount(3); // Notification preferences only.
      await page.reload(); await expect(input).toHaveValue(suggestion);
      // Showing the suggestion creates no profile: nothing is listed until saved.
      expect(await fixture(async client => Number((await client.query('SELECT count(*) FROM "Profile" WHERE "userId"=$1', [id])).rows[0].count))).toBe(0);
      await page.getByRole("button", { name: identityText[locale].save, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator("#identity-feedback")).toHaveText(identityText[locale].saved); await fits(page);
      const response = await other.request.get(`/api/people?q=${encodeURIComponent(suggestion)}`);
      expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
      const item = (await response.json()).items[0]; expect(Object.keys(item).sort()).toEqual(["displayName", "id"]); expect(item.id).not.toBe(id);
      const viewer = await other.newPage(); await searchPeople(viewer, locale, suggestion);
      await results(viewer).getByRole("link", { name: suggestion, exact: true }).click();
      await expect(viewer).toHaveURL(`${origin}/${locale}/people/${item.id}`);
      await expect(viewer.getByRole("heading", { name: suggestion, exact: true })).toBeVisible();
      expect((await context.request.put("/api/people/profile", { data: { displayName: suggestion, directoryVisible: false }, headers: { Origin: origin } })).status()).toBe(400);
      await viewer.reload(); await expect(viewer.getByRole("heading", { name: suggestion, exact: true })).toBeVisible();
      await page.reload(); await expect(input).toHaveValue(suggestion);
      expect((await other.request.get(`/api/people/${item.id}`)).status()).toBe(200);
    } finally { await other.close(); }
  });
}
test("people endpoints enforce verification, origin, exact inputs and generic unavailable responses", async ({ context, browser }) => {
  const anonymous = await browser.newContext();
  try {
    expect((await anonymous.request.get("/api/people?q=Member")).status()).toBe(401);
    expect((await anonymous.request.get(`/api/people/${randomUUID()}`)).status()).toBe(401);
    await signIn(context);
    expect((await context.request.put("/api/people/profile", { data: { displayName: "Forged" } })).status()).toBe(403);
    for (const data of [{ displayName: "Forged", directoryVisible: true, userId: randomUUID() }, { displayName: "A", directoryVisible: "true" }, { displayName: "", directoryVisible: true }]) {
      expect((await context.request.put("/api/people/profile", { data, headers: { Origin: origin } })).status()).toBe(400);
    }
    for (const query of ["q=x", "q=Member&q=Other", "q=Member&email=private", "q=Member&after=bad"]) expect((await context.request.get(`/api/people?${query}`)).status()).toBe(400);
    const absent = await context.request.get(`/api/people/${randomUUID()}`); expect(absent.status()).toBe(404); expect(await absent.json()).toEqual({ ok: false });
  } finally { await anonymous.close(); }
});

test("review regression: both profile HTTP routes share one budget across independent sessions", async ({ context, browser }) => {
  const ownerId = await signIn(context), other = await browser.newContext(), token = newToken();
  try {
    await fixture(client => client.query('INSERT INTO "Session" (id,"userId","tokenDigest","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')', [randomUUID(), ownerId, digest(token)]));
    await other.addCookies([{ name: sessionCookie, value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const write = (session: BrowserContext, legacy: boolean, displayName: string) => legacy
      ? session.request.post("/api/identity/profile", { data: { displayName }, headers: { Origin: origin } })
      : session.request.put("/api/people/profile", { data: { displayName }, headers: { Origin: origin } });
    for (let i = 0; i < 30; i++) expect((await write(i % 2 ? other : context, i % 2 === 1, "HTTP shared budget")).status()).toBe(200);
    const snapshot = () => fixture(async client => JSON.stringify((await client.query('SELECT * FROM "Profile" WHERE "userId"=$1', [ownerId])).rows));
    const before = await snapshot();
    const responses = [await write(context, true, "Legacy beyond limit"), await write(other, false, "People beyond limit")];
    expect(responses.map(response => response.status())).toEqual([429, 429]);
    for (const response of responses) { expect(await response.json()).toEqual({ ok: false }); expect(response.headers()["cache-control"]).toBe("private, no-store"); expect(response.headers()["set-cookie"]).toBeUndefined(); }
    expect(await snapshot() === before).toBe(true);
    const hits = await fixture(async client => (await client.query('SELECT hits FROM "IdentityRateLimit" WHERE "keyDigest"=$1', [digest(`m4-profile-save:${ownerId}`)])).rows[0].hits);
    expect(hits).toBe(30);
    expect((await context.request.get("/api/people?q=HTTP%20shared%20budget")).status()).toBe(200);
  } finally { await other.close(); }
});

test("review regression: both profile HTTP routes reject embedded controls without mutating visible profiles", async ({ context }) => {
  const ownerId = await signIn(context), marker = `Safe${randomUUID().slice(0, 8)}`;
  await save(context, `${marker} أحمد Ali 😀`);
  const snapshot = () => fixture(async client => JSON.stringify((await client.query('SELECT * FROM "Profile" WHERE "userId"=$1', [ownerId])).rows));
  const before = await snapshot();
  for (const control of ["\t", "\n", "\u007f", "\u202e", "\u2066", "\u200b"]) {
    const displayName = `${marker} A${control}B`;
    const responses = [await context.request.post("/api/identity/profile", { data: { displayName }, headers: { Origin: origin } }),
      await context.request.put("/api/people/profile", { data: { displayName }, headers: { Origin: origin } })];
    expect(responses.map(response => response.status())).toEqual([400, 400]);
    for (const response of responses) expect(await response.json()).toEqual({ ok: false });
  }
  expect(await snapshot() === before).toBe(true);
  const items = (await (await context.request.get(`/api/people?q=${marker}`)).json()).items;
  expect(items).toHaveLength(1); expect(items[0].displayName).toBe(`${marker} أحمد Ali 😀`);
  const detail = await context.request.get(`/api/people/${items[0].id}`); expect(detail.status()).toBe(200); expect((await detail.json()).displayName).toBe(items[0].displayName);
  const valid = await context.request.post("/api/identity/profile", { data: { displayName: "  اسم صالح Valid 😀  " }, headers: { Origin: origin } });
  expect(valid.status()).toBe(200);
  const renamed = await context.request.get(`/api/people/${items[0].id}`); expect((await renamed.json()).displayName).toBe("اسم صالح Valid 😀");
});
