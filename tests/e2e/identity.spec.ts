import { expect, test, type Page, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { identityText } from "../../src/i18n/identity";
import { databaseUrl, assertDatabaseIdentity, readManifest } from "../../tools/database/targets";
import { digest, keyedDigest, newToken, pendingCookie, sessionCookie } from "../../src/server/identity/policy";

// These flows carry synthetic bearer credentials. Do not persist network traces,
// videos, screenshots or assertion output containing URLs/cookies/tokens.
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const address = () => `browser.${randomUUID()}@university.test`;
async function post(request: APIRequestContext, operation: string, data: object, headers: Record<string, string> = {}) {
  return request.post(`/api/identity/${operation}`, { data, headers: { Origin: origin, ...headers } });
}
async function mailbox(email: string): Promise<string | undefined> {
  try {
    const control = JSON.parse(readFileSync(".cache/m2-browser.json", "utf8")) as { port: number; key: string; databaseName: string };
    if (control.databaseName !== process.env.M2_BROWSER_DATABASE) throw new Error("Wrong control target");
    return await new Promise((accept, reject) => {
      const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, email }) + "\n"));
      socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Test mailbox timeout")); });
      let data = "";
      socket.on("data", (chunk) => { data += chunk.toString(); });
      socket.on("end", () => {
        try { const result = JSON.parse(data) as { token?: string }; accept(result.token); }
        catch { reject(new Error("Test mailbox response invalid")); }
      });
      socket.on("error", () => reject(new Error("Test mailbox unavailable")));
    });
  } catch { throw new Error("Private synthetic mailbox unavailable"); }
}
async function tokenFor(email: string) {
  await expect.poll(async () => Boolean(await mailbox(email))).toBe(true);
  const token = await mailbox(email);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Synthetic token unavailable");
  return token;
}
async function openLink(page: Page, locale: "en" | "ar", token: string) {
  try {
    await page.goto(`/${locale}/verify`);
    const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await page.evaluate(({ locale, token }) => window.location.replace(`/${locale}/verify#${token}`), { locale, token });
    await navigation;
    await page.waitForFunction(() => window.location.hash === "");
  } catch { throw new Error("Synthetic link navigation failed; credentials omitted"); }
}
async function fixtureSQL(sql: string, parameters: unknown[] = []) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some((d) => d.name === name && d.kind === "test" && d.ready)) throw new Error("Disposable browser fixture required");
  const url = databaseUrl(manifest, name!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return (await client.query(sql, parameters)).rows; }
  catch { throw new Error("Owned synthetic fixture operation failed; diagnostics omitted"); }
  finally { await client.end(); }
}

async function savedProfile(page: Page, context: BrowserContext, locale: "en" | "ar") {
  const email = address(), text = identityText[locale];
  await page.goto(`/${locale}/signin`);
  expect((await post(context.request, "request", { email, locale })).status()).toBe(202);
  await openLink(page, locale, await tokenFor(email));
  await page.getByRole("button", { name: text.confirm }).click();
  await expect(page.getByLabel(text.name)).toBeVisible();
  await page.getByLabel(text.name).fill("Synthetic owner أحمد");
  await page.getByRole("button", { name: text.save }).click();
  await expect(page.getByRole("status")).toHaveText(text.saved);
  const cookie = (await context.cookies()).find((item) => item.name === sessionCookie);
  if (!cookie) throw new Error("Synthetic session cookie missing; credentials omitted");
  await context.addCookies([{ name: pendingCookie, value: newToken(), url: origin, httpOnly: true, sameSite: "Lax" }]);
  return { cookie, email };
}

for (const from of ["en", "ar"] as const) {
  const to = from === "en" ? "ar" : "en";
  test(`${from} -> ${to}: language switching retains memory-only confirmation and single-use browser binding`, async ({ page, context, browser }) => {
    const email = address();
    const urls: string[] = [];
    page.on("request", (request) => { urls.push(request.url()); });
    await page.goto(`/${from}/signin`);
    expect((await post(context.request, "request", { email, locale: from })).status()).toBe(202);
    const token = await tokenFor(email), pending = (await context.cookies()).find((item) => item.name === pendingCookie)!;
    await openLink(page, from, token);
    const language = page.getByRole("link", { name: to === "ar" ? "العربية" : "English", exact: true });
    await language.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${to}/verify$`));
    await expect(page.locator("html")).toHaveAttribute("lang", to);
    await expect(page.locator("html")).toHaveAttribute("dir", to === "ar" ? "rtl" : "ltr");
    expect((await context.request.get("/api/identity/profile")).status()).toBe(401);
    const other = await browser.newContext({ baseURL: origin });
    try { expect((await post(other.request, "confirm", { token, locale: to })).status()).toBe(400); }
    finally { await other.close(); }
    expect(await page.evaluate((credential) => {
      const storage = [...Object.values(localStorage), ...Object.values(sessionStorage), JSON.stringify(history.state), document.documentElement.outerHTML];
      return storage.some((value) => value?.includes(credential));
    }, token)).toBe(false);
    await page.getByRole("button", { name: identityText[to].confirm }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${to}/profile$`));
    await expect(page.getByLabel(identityText[to].name)).toBeVisible();
    expect(urls.some((url) => url.includes(token))).toBe(false);
    expect((await post(context.request, "confirm", { token, locale: to }, { Cookie: `${pendingCookie}=${pending.value}` })).status()).toBe(400);
  });
}

for (const state of ["expired", "revoked", "absent"] as const) {
  test(`${state} session logout clears both cookies, leaves the profile and denies replay`, async ({ page, context }) => {
    const locale = state === "revoked" ? "ar" : "en", text = identityText[locale];
    const { cookie, email } = await savedProfile(page, context, locale);
    if (state === "expired") await fixtureSQL('UPDATE "Session" SET "createdAt" = now() - interval \'8 days\', "expiresAt" = now() - interval \'1 day\' WHERE "tokenDigest" = $1', [digest(cookie.value)]);
    else if (state === "revoked") await fixtureSQL('UPDATE "Session" SET "revokedAt" = clock_timestamp() WHERE "tokenDigest" = $1', [digest(cookie.value)]);
    else await fixtureSQL('DELETE FROM "Session" WHERE "tokenDigest" = $1', [digest(cookie.value)]);
    const response = page.waitForResponse((result) => result.url().endsWith("/api/identity/logout") && result.request().method() === "POST");
    await page.getByRole("button", { name: text.logout }).click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/${locale}/signin$`));
    await expect(page.getByLabel(text.email)).toBeVisible();
    await expect(page.getByLabel(text.name)).not.toBeVisible();
    expect((await page.content()).includes(email)).toBe(false);
    expect((await context.cookies()).some((item) => item.name === sessionCookie || item.name === pendingCookie)).toBe(false);
    expect((await context.request.get("/api/identity/profile", { headers: { Cookie: `${sessionCookie}=${cookie.value}` } })).status()).toBe(401);
    expect((await post(context.request, "profile", { displayName: "Replay" }, { Cookie: `${sessionCookie}=${cookie.value}` })).status()).toBe(401);
    // A repeated logout with no session is also successful and reveals no identity.
    expect((await post(context.request, "logout", {})).status()).toBe(200);
  });
}

test("genuine database read/revocation failures retain cookies and show failure until logout can commit", async ({ page, context }) => {
  const text = identityText.en, { cookie } = await savedProfile(page, context, "en");
  async function failedLogout() {
    const response = page.waitForResponse((result) => result.url().endsWith("/api/identity/logout") && result.request().method() === "POST");
    await page.getByRole("button", { name: text.logout }).click();
    const result = await response;
    expect(result.status()).toBe(503);
    expect(result.headers()["set-cookie"] === undefined).toBe(true);
    await expect(page).toHaveURL(/\/en\/profile$/);
    await expect(page.getByLabel(text.name)).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(text.failed);
    await expect(page.getByRole("status")).toBeFocused();
    expect((await context.cookies()).some((item) => item.name === sessionCookie && item.value === cookie.value)).toBe(true);
    expect((await context.cookies()).some((item) => item.name === pendingCookie)).toBe(true);
  }
  // Static fault fixture, created only in this marker-verified disposable DB.
  await fixtureSQL(`CREATE FUNCTION public.usp_m2_review_reject_logout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic logout failure'; END $$`);
  let triggerCreated = false;
  try {
    await fixtureSQL('CREATE TRIGGER usp_m2_review_reject_logout BEFORE UPDATE OF "revokedAt" ON "Session" FOR EACH ROW EXECUTE FUNCTION public.usp_m2_review_reject_logout()');
    triggerCreated = true;
    await failedLogout();
    expect((await fixtureSQL('SELECT "revokedAt" FROM "Session" WHERE "tokenDigest" = $1', [digest(cookie.value)]))[0].revokedAt === null).toBe(true);
    expect((await context.request.get("/api/identity/profile")).status()).toBe(200);
  } finally {
    if (triggerCreated) await fixtureSQL('DROP TRIGGER usp_m2_review_reject_logout ON "Session"');
    await fixtureSQL('DROP FUNCTION public.usp_m2_review_reject_logout()');
  }
  // readManifest validates this generated role identifier; no untrusted SQL.
  const role = readManifest().runtimeRole;
  await fixtureSQL(`REVOKE SELECT ON "Session" FROM "${role}"`);
  try { await failedLogout(); }
  finally { await fixtureSQL(`GRANT SELECT ON "Session" TO "${role}"`); }
  expect((await context.request.get("/api/identity/profile")).status()).toBe(200);
  await page.getByRole("button", { name: text.logout }).click();
  await expect(page.getByLabel(text.email)).toBeVisible();
  expect((await context.cookies()).some((item) => item.name === sessionCookie || item.name === pendingCookie)).toBe(false);
  expect((await context.request.get("/api/identity/profile", { headers: { Cookie: `${sessionCookie}=${cookie.value}` } })).status()).toBe(401);
});

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: synthetic verification, Unicode profile, return, keyboard focus and revoked logout`, async ({ page, context }) => {
    const text = identityText[locale], email = address();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/${locale}/signin`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(page.getByLabel(text.email)).toBeFocused();
    await expect(page.getByLabel(text.email)).toHaveAttribute("dir", "ltr");
    await page.getByLabel(text.email).fill(email);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: text.request })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(text.requested);
    await expect(page.getByRole("status")).toBeFocused();
    const token = await tokenFor(email);
    await openLink(page, locale, token);
    expect((await context.request.get("/api/identity/profile")).status()).toBe(401); // GET/scanner has not signed in.
    await page.getByRole("button", { name: text.confirm }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByLabel(text.name)).toBeVisible();
    const name = locale === "ar" ? "أحمد Ali 😀" : "Alice أحمد 😀";
    await page.getByLabel(text.name).fill(" "); await page.getByRole("button", { name: text.save }).click();
    await expect(page.getByRole("status")).toHaveText(text.invalidName); await expect(page.getByRole("status")).toBeFocused();
    await page.getByLabel(text.name).fill("😀".repeat(60)); await page.getByRole("button", { name: text.save }).click();
    await expect(page.getByRole("status")).toHaveText(text.saved);
    await page.getByLabel(text.name).fill(name); await page.getByRole("button", { name: text.save }).click();
    await expect(page.getByRole("status")).toHaveText(text.saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload(); await expect(page.getByLabel(text.name)).toHaveValue(name);
    const cookie = (await context.cookies()).find((item) => item.name === sessionCookie)!;
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Lax"); expect(cookie.secure).toBe(false); // Explicit loopback HTTP.
    const response = await context.request.get("/api/identity/profile");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    await page.getByRole("button", { name: text.logout }).click(); await expect(page.getByLabel(text.email)).toBeVisible();
    expect((await context.request.get("/api/identity/profile")).status()).toBe(401);
    const replay = await context.request.get("/api/identity/profile", { headers: { Cookie: `${sessionCookie}=${cookie.value}` } });
    expect(replay.status()).toBe(401);
    // A fresh email login preserves the profile rather than creating another account.
    await fixtureSQL('UPDATE "EmailOwnershipChallenge" SET "createdAt" = "createdAt" - interval \'61 seconds\' WHERE "emailKey" = $1', [email]);
    await page.getByLabel(text.email).fill(email); await page.getByRole("button", { name: text.request }).click();
    await expect(page.getByRole("status")).toHaveText(text.requested);
    await openLink(page, locale, await tokenFor(email)); await page.getByRole("button", { name: text.confirm }).click();
    await expect(page.getByLabel(text.name)).toHaveValue(name);
  });
}

test("browser binding, scanner GET, single-use replay, expiry and private profile boundaries", async ({ page, context, browser }) => {
  const email = address(), text = identityText.en;
  await page.goto("/en/signin"); await page.getByLabel(text.email).fill(email); await page.getByRole("button", { name: text.request }).click();
  await expect(page.getByRole("status")).toHaveText(text.requested);
  const token = await tokenFor(email), pending = (await context.cookies()).find((item) => item.name === pendingCookie)!;
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect((await post(other.request, "confirm", { token, locale: "en" })).status()).toBe(400);
    expect((await other.request.get("/api/identity/profile")).status()).toBe(401);
    expect((await context.request.get("/api/identity/confirm")).status()).toBe(404);
    expect((await context.request.get("/api/identity/profile")).status()).toBe(401);
    await openLink(page, "en", token); await page.getByRole("button", { name: text.confirm }).click();
    await expect(page.getByLabel(text.name)).toBeVisible();
    await page.getByLabel(text.name).fill("Alice"); await page.getByRole("button", { name: text.save }).click();
    await expect(page.getByRole("status")).toHaveText(text.saved);
    expect((await post(context.request, "confirm", { token, locale: "en" }, { Cookie: `${pendingCookie}=${pending.value}` })).status()).toBe(400);
    expect((await post(context.request, "profile", { displayName: "Hijack", userId: randomUUID() })).status()).toBe(400);
    expect((await post(context.request, "profile", { displayName: "Hijack", email: address(), role: "teacher" })).status()).toBe(400);
    expect((await context.request.get(`/api/identity/profile?userId=${randomUUID()}`)).status()).toBe(404);
    const owner = await context.request.get("/api/identity/profile"); expect((await owner.json()).displayName).toBe("Alice");
    // Second account's cookie authorizes only the second account's profile.
    const secondEmail = address(); await post(other.request, "request", { email: secondEmail, locale: "en" });
    const secondToken = await tokenFor(secondEmail); expect((await post(other.request, "confirm", { token: secondToken, locale: "en" })).status()).toBe(200);
    expect((await post(other.request, "profile", { displayName: "علي" })).status()).toBe(200);
    expect((await (await context.request.get("/api/identity/profile")).json()).displayName).toBe("Alice");
    expect((await (await other.request.get("/api/identity/profile")).json()).displayName).toBe("علي");
  } finally { await other.close(); }
  const expiredEmail = address(); await post(context.request, "request", { email: expiredEmail, locale: "en" });
  const expiredToken = await tokenFor(expiredEmail);
  await fixtureSQL('UPDATE "EmailOwnershipChallenge" SET "createdAt" = now() - interval \'11 minutes\', "expiresAt" = now() - interval \'1 minute\' WHERE "tokenDigest" = $1', [digest(expiredToken)]);
  await openLink(page, "en", expiredToken);
  await page.getByRole("link", { name: "العربية", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/verify$/);
  await page.getByRole("button", { name: identityText.ar.confirm }).click();
  await expect(page.getByRole("status")).toHaveText(identityText.ar.linkError); await expect(page.getByRole("status")).toBeFocused();
});

test("generic request responses, CSRF, immutable email and synthetic-only operation", async ({ request }) => {
  const email = address();
  const fresh = await post(request, "request", { email, locale: "en" });
  const existing = await post(request, "request", { email, locale: "en" });
  const ineligible = await post(request, "request", { email: "synthetic@stu.najah.edu", locale: "en" });
  for (const response of [fresh, existing, ineligible]) { expect(response.status()).toBe(202); expect(await response.json()).toEqual({ ok: true }); }
  expect((await mailbox("synthetic@stu.najah.edu")) === undefined).toBe(true);
  expect((await post(request, "request", { email: address(), locale: "en" }, { Origin: "https://untrusted.test" })).status()).toBe(403);
  expect((await post(request, "request", { email: address(), locale: "en" }, { Origin: "" })).status()).toBe(403);
  expect((await post(request, "profile", { email: address(), displayName: "Escalation" })).status()).toBe(400);
  expect((await request.delete("/api/identity/profile", { headers: { Origin: origin } })).status()).toBe(405);
  const oversized = await request.post("/api/identity/request", { data: { email: "x".repeat(9000), locale: "en" }, headers: { Origin: origin } });
  expect(oversized.status()).toBe(400);
});

test("actual peer IP limits resist forged forwarding headers", async ({ request }) => {
  // Fixture time moves only inside this run's owned disposable database.
  await fixtureSQL('UPDATE "IdentityRateLimit" SET "startedAt" = now() - interval \'16 minutes\'');
  let last = "";
  for (let i = 0; i < 31; i++) {
    last = address();
    const response = await post(request, "request", { email: last, locale: "en" }, { "X-Forwarded-For": `198.51.100.${i + 1}`, "X-USP-Peer": `198.51.100.${i + 1}`, "X-USP-Peer-Signature": "a".repeat(64) });
    expect(response.status()).toBe(202); expect(await response.json()).toEqual({ ok: true });
  }
  expect((await mailbox(last)) === undefined).toBe(true);
  const manifest = readManifest();
  const rateKey = keyedDigest(manifest.runtimePassword, "usp-m2-local-rate-limits");
  const rows = await fixtureSQL('SELECT hits FROM "IdentityRateLimit" WHERE "keyDigest" = $1', [keyedDigest(rateKey, "ip:request:127.0.0.1")]);
  expect(rows[0].hits).toBe(30);
  for (let i = 0; i < 31; i++) expect((await post(request, "confirm", { token: newToken(), locale: "en" }, { "X-Forwarded-For": `203.0.113.${i + 1}` })).status()).toBe(400);
  const confirmations = await fixtureSQL('SELECT hits FROM "IdentityRateLimit" WHERE "keyDigest" = $1', [keyedDigest(rateKey, "ip:confirm:127.0.0.1")]);
  expect(confirmations[0].hits).toBe(30);
});
