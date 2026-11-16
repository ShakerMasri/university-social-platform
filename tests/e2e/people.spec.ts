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
async function search(page: Page, locale: "en" | "ar", query: string) {
  const text = peopleText[locale];
  await page.getByLabel(text.query, { exact: true }).fill(query);
  await page.getByRole("button", { name: text.submit, exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: text.results, exact: true })).toBeFocused();
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("main input, main button").evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1;
  }))).toBe(true);
}
type PeopleBrowser = Window & { next: { router: { refresh(): void } }; peopleHold: { reached: boolean; release(): void } };
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: Unicode-number typos respect whole words, partial matching and saved profiles`, async ({ context, page, browser }) => {
    const owner = await browser.newContext(), hidden = await browser.newContext(), marker = randomUUID().slice(0, 8);
    const displayName = `${marker} a³a`;
    try {
      await signIn(context); await signIn(owner); await signIn(hidden);
      await save(owner, displayName); // The other account has no saved profile.
      await page.goto(`/${locale}/people`); await search(page, locale, `${marker} a²a`);
      await expect(page.locator(".people-result")).toHaveCount(1);
      const link = page.getByRole("link", { name: displayName, exact: true }), destination = await link.getAttribute("href");
      await link.click(); await expect(page.getByRole("heading", { name: displayName, exact: true })).toBeVisible();
      await save(owner, `${marker} ab²zz`);
      await page.goto(`/${locale}/people`); await search(page, locale, `${marker} abc`);
      await expect(page.locator(".people-result")).toHaveCount(0);
      await expect(page.getByText(peopleText[locale].empty, { exact: true })).toBeVisible();
      await search(page, locale, `${marker} ²z`);
      await expect(page.locator(".people-result")).toHaveCount(1);
      await fixture(client => client.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=(SELECT "userId" FROM "Profile" WHERE "directoryId"=$1)', [destination!.split("/").at(-1)]));
      await search(page, locale, `${marker} ²z`);
      await expect(page.locator(".people-result")).toHaveCount(0);
      expect((await context.request.get(`/api/people/${destination!.split("/").at(-1)}`)).status()).toBe(404);
    } finally { await owner.close(); await hidden.close(); }
  });
  test(`${locale}: suggests saved profiles for typos and separate name parts and excludes unverified accounts`, async ({ context, page, browser }) => {
    const owner = await browser.newContext(), hidden = await browser.newContext(), marker = randomUUID().slice(0, 8);
    const displayName = `${marker} أَحْـمَد Ahmed Mahmoud`;
    try {
      await signIn(context); await signIn(owner); await signIn(hidden);
      await save(owner, displayName); // The other account has no saved profile.
      await page.goto(`/${locale}/people`);
      await search(page, locale, `Mahmoud ${marker} Ahmde`);
      await expect(page.locator(".people-result")).toHaveCount(1);
      const link = page.getByRole("link", { name: displayName, exact: true }), destination = await link.getAttribute("href");
      await expect(link).toBeVisible();
      await search(page, locale, `${marker} أحدم`);
      await expect(page.locator(".people-result")).toHaveCount(1); await expect(link).toHaveAttribute("href", destination!);
      await link.click(); await expect(page.getByRole("heading", { name: displayName, exact: true })).toBeVisible();
      await fixture(client => client.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=(SELECT "userId" FROM "Profile" WHERE "directoryId"=$1)', [destination!.split("/").at(-1)]));
      await page.goto(`/${locale}/people`);
      await search(page, locale, `${marker} Ahmde`);
      await expect(page.locator(".people-result")).toHaveCount(0);
      await expect(page.getByText(peopleText[locale].empty, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: peopleText[locale].settings, exact: true })).toHaveAttribute("href", `/${locale}/profile`);
      expect((await context.request.get(`/api/people/${destination!.split("/").at(-1)}`)).status()).toBe(404);
      await page.setViewportSize({ width: 320, height: 900 }); await fits(page);
    } finally { await owner.close(); await hidden.close(); }
  });
  test(`${locale}: saves a generated label, searches without shared membership and offers no hiding control`, async ({ context, page, browser }) => {
    const id = await signIn(context), other = await browser.newContext(), text = peopleText[locale];
    try {
      await signIn(other); await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`/${locale}/profile`);
      const input = page.getByLabel(identityText[locale].name, { exact: true });
      const suggestion = await input.inputValue(); expect(suggestion).toMatch(new RegExp(`^${text.suggestion} [0-9A-F]{10}$`));
      await expect(page.getByText(text.directoryHint, { exact: true })).toBeVisible();
      await expect(page.getByRole("checkbox")).toHaveCount(3); // Notification preferences only.
      await page.reload(); await expect(input).toHaveValue(suggestion);
      expect(await fixture(async client => Number((await client.query('SELECT count(*) FROM "Profile" WHERE "userId"=$1', [id])).rows[0].count))).toBe(0);
      await page.getByRole("button", { name: identityText[locale].save, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator("#identity-feedback")).toHaveText(identityText[locale].saved); await fits(page);
      const response = await other.request.get(`/api/people?q=${encodeURIComponent(suggestion)}`);
      expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
      const item = (await response.json()).items[0]; expect(Object.keys(item).sort()).toEqual(["displayName", "id"]); expect(item.id).not.toBe(id);
      const viewer = await other.newPage(); await viewer.goto(`/${locale}/people`); await search(viewer, locale, suggestion);
      await viewer.getByRole("link", { name: suggestion, exact: true }).click();
      await expect(viewer).toHaveURL(`${origin}/${locale}/people/${item.id}`);
      await expect(viewer.getByRole("heading", { name: suggestion, exact: true })).toBeVisible();
      expect((await context.request.put("/api/people/profile", { data: { displayName: suggestion, directoryVisible: false }, headers: { Origin: origin } })).status()).toBe(400);
      await viewer.reload(); await expect(viewer.getByRole("heading", { name: suggestion, exact: true })).toBeVisible();
      await page.reload(); await expect(input).toHaveValue(suggestion);
      expect((await other.request.get(`/api/people/${item.id}`)).status()).toBe(200);
    } finally { await other.close(); }
  });
  test(`${locale}: literal bilingual search, inert names, pagination, failure/retry and revoked caller`, async ({ context, page }) => {
    await signIn(context); const marker = randomUUID().slice(0, 8), displayName = `أَحْـمَد Ali ${marker} <svg onload=window.peopleXSS=1>`;
    await fixture(async client => {
      for (let i = 0; i < 23; i++) {
        const id = randomUUID(); await client.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, `${id}@university.test`]);
        await client.query('INSERT INTO "Profile" ("userId","displayName","directoryVisible","updatedAt") VALUES ($1,$2,true,now())', [id, displayName]);
      }
    });
    await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/${locale}/people`);
    await search(page, locale, `أحمد ali ${marker}`); await expect(page.locator(".people-result")).toHaveCount(20); await fits(page);
    expect(await page.evaluate(() => (window as unknown as { peopleXSS?: number }).peopleXSS)).toBeUndefined();
    const text = peopleText[locale];
    await page.route("**/api/people?**", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }), { times: 1 });
    await page.getByRole("button", { name: text.next, exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.failed);
    await page.getByRole("button", { name: text.retry, exact: true }).click(); await expect(page.locator(".people-result")).toHaveCount(3);
    await search(page, locale, "NoMatchingSyntheticName"); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
    await context.request.post("/api/identity/logout", { data: {}, headers: { Origin: origin } });
    await search(page, locale, marker); await expect(page.getByRole("main").getByRole("alert")).toHaveText(text.unavailable);
    await expect(page.locator(".people-result")).toHaveCount(0);
  });
  test(`${locale}: real server refresh invalidates delayed people results and query state`, async ({ context, page, browser }) => {
    const owner = await browser.newContext();
    try {
      await signIn(context); await signIn(owner); const marker = `Held${randomUUID()}`; await save(owner, marker);
      await page.goto(`/${locale}/people`);
      await page.evaluate(() => {
        const target = window as unknown as PeopleBrowser, original = window.fetch;
        let release!: () => void, once = true; const gate = new Promise<void>(done => { release = done; });
        target.peopleHold = { reached: false, release: () => { window.fetch = original; release(); } };
        window.fetch = async (...args) => {
          const response = await original(...args), input = args[0];
          const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href).pathname;
          if (path === "/api/people" && once) {
            once = false; const json = response.json.bind(response);
            response.json = async () => { const value: unknown = await json(); target.peopleHold.reached = true; await gate; return value; };
          }
          return response;
        };
      });
      await page.getByLabel(peopleText[locale].query, { exact: true }).fill(marker);
      await page.getByRole("button", { name: peopleText[locale].submit, exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as PeopleBrowser).peopleHold.reached)).toBe(true);
      await save(owner, `Changed${randomUUID()}`);
      const refresh = page.waitForResponse(response => new URL(response.url()).pathname === `/${locale}/people` && response.request().headers().rsc === "1");
      await page.evaluate(() => (window as unknown as PeopleBrowser).next.router.refresh()); expect((await refresh).status()).toBe(200);
      await expect(page.getByLabel(peopleText[locale].query, { exact: true })).toHaveValue("");
      await page.evaluate(() => (window as unknown as PeopleBrowser).peopleHold.release());
      await expect(page.locator(".people-result")).toHaveCount(0); await expect(page.getByText(peopleText[locale].initial, { exact: true })).toBeVisible();
      await search(page, locale, marker); await expect(page.getByText(peopleText[locale].empty, { exact: true })).toBeVisible();
    } finally { await owner.close(); }
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
