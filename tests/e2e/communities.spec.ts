import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { communityText } from "../../src/i18n/communities";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { syntheticTokenFor } from "./synthetic-mail";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const post = (request: APIRequestContext, path: string, data: object, headers: Record<string, string> = {}) => request.post(path, { data, headers: { Origin: origin, ...headers } });
async function fixture(sql: string) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some((d) => d.name === name && d.kind === "test" && d.ready)) throw new Error("Owned community browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); await client.query(sql); }
  catch { throw new Error("Synthetic community fixture failed; diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => {
  // Isolate pre-existing IP-limiter windows in the owned test DB. No public
  // endpoint or application authorization bypass enables this fixture.
  await fixture('UPDATE "IdentityRateLimit" SET "startedAt" = now() - interval \'16 minutes\'');
});
async function signIn(context: BrowserContext, displayName?: string) {
  const email = `m3.browser.${randomUUID()}@university.test`;
  expect((await post(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await post(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (displayName) expect((await post(context.request, "/api/identity/profile", { displayName })).status()).toBe(200);
}
test("empty community discovery is localized in English and Arabic", async ({ page, context }) => {
  await signIn(context, "Synthetic first user");
  for (const locale of ["en", "ar"] as const) {
    await page.goto(`/${locale}/communities`);
    await expect(page.getByText(communityText[locale].empty, { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  }
});
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: verified non-member reads a public space, joins and leaves by keyboard`, async ({ context, browser }) => {
    await signIn(context, "Public owner");
    const created = await post(context.request, "/api/communities", { name: `Public عام ${locale}`, description: "Public synthetic space", visibility: "PUBLIC" });
    expect(created.status()).toBe(201);
    const { id } = await created.json() as { id: string };
    const member = await browser.newContext({ baseURL: origin }), memberPage = await member.newPage();
    try {
      await signIn(member, "Public member"); await memberPage.goto(`/${locale}/communities/${id}`);
      const text = communityText[locale];
      await expect(memberPage.getByText(text.space, { exact: true })).toBeVisible();
      const join = memberPage.getByRole("button", { name: text.join, exact: true }); await join.focus(); await memberPage.keyboard.press("Enter");
      await expect(memberPage.getByRole("button", { name: text.leave, exact: true })).toBeVisible();
      const leave = memberPage.getByRole("button", { name: text.leave, exact: true }); await leave.focus(); await memberPage.keyboard.press("Enter");
      await expect(memberPage.getByRole("button", { name: text.join, exact: true })).toBeVisible();
      expect((await member.request.get(`/api/communities/${id}`)).status()).toBe(200);
    } finally { await member.close(); }
  });
  test(`${locale}: keyboard private creation, request, owner approval/removal, direct-link denial and RTL`, async ({ page, context, browser }) => {
    const text = communityText[locale], title = `هندسة Computer 😀 ${randomUUID().slice(0, 8)}`;
    await signIn(context, "مالك Owner"); await page.goto(`/${locale}/profile`);
    const link = page.getByRole("link", { name: text.title, exact: true }); await link.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: text.title, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await page.getByLabel(text.name, { exact: true }).fill(title);
    await page.getByLabel(text.description, { exact: true }).fill("معلومات Synthetic bilingual description");
    await page.getByLabel(text.visibility, { exact: true }).selectOption("PRIVATE");
    const create = page.getByRole("button", { name: text.create, exact: true }); await create.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    const other = await browser.newContext({ baseURL: origin }), otherPage = await other.newPage();
    try {
      await signIn(other, "عضو Member"); await otherPage.goto(`/${locale}/communities/${id}`);
      await expect(otherPage.getByRole("main").getByRole("alert")).toHaveText(text.unavailable);
      await expect(otherPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
      expect((await other.request.get(`/api/communities/${id}`)).status()).toBe(404);
      expect((await other.request.get(`/api/communities/${id}/memberships`)).status()).toBe(403);
      await otherPage.goto(`/${locale}/communities`);
      const card = otherPage.locator(".community-card").filter({ has: otherPage.getByRole("heading", { name: title, exact: true }) });
      await expect(card).toBeVisible();
      const join = card.getByRole("button", { name: text.request }); await join.focus(); await otherPage.keyboard.press("Enter");
      await expect(card.getByText(text.pending, { exact: false })).toBeVisible();
      expect((await other.request.get(`/api/communities/${id}`)).status()).toBe(404);
      await page.reload();
      const member = page.locator(".community-card").filter({ hasText: "عضو Member" });
      const approve = member.getByRole("button", { name: text.approve }); await approve.focus(); await page.keyboard.press("Enter");
      await expect.poll(async () => (await other.request.get(`/api/communities/${id}`)).status()).toBe(200);
      const listing = await (await context.request.get(`/api/communities/${id}/memberships`)).json() as { items: { userId: string; isOwner: boolean }[] };
      const ownerId = listing.items.find((item) => item.isOwner)!.userId;
      for (const action of ["approve", "remove"]) expect((await post(other.request, `/api/communities/${id}/memberships`, { action, userId: ownerId })).status()).toBe(403);
      expect((await other.request.get(`/api/communities/${id}/memberships`)).status()).toBe(403);
      await otherPage.goto(`/${locale}/communities/${id}`); await expect(otherPage.getByText(text.space)).toBeVisible();
      const targetLocale = locale === "en" ? "ar" : "en";
      const language = page.getByRole("link", { name: targetLocale === "ar" ? "العربية" : "English", exact: true });
      await language.focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/${targetLocale}/communities/${id}$`));
      await expect(page.locator("html")).toHaveAttribute("dir", targetLocale === "ar" ? "rtl" : "ltr");
      const remove = page.locator(".community-card").filter({ hasText: "عضو Member" }).getByRole("button", { name: communityText[targetLocale].remove });
      await remove.focus(); await page.keyboard.press("Enter");
      await expect.poll(async () => (await other.request.get(`/api/communities/${id}`)).status()).toBe(404);
      await otherPage.reload(); await expect(otherPage.getByRole("main").getByRole("alert")).toHaveText(text.unavailable);
      await expect(otherPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    } finally { await other.close(); }
  });
  test(`${locale}: loading, safe failure focus and bounded validation`, async ({ page, context }) => {
    const text = communityText[locale]; await signIn(context, "Synthetic tester"); await page.goto(`/${locale}/communities`);
    await page.getByLabel(text.name, { exact: true }).fill("x".repeat(81));
    await page.getByRole("button", { name: text.create, exact: true }).click();
    const feedback = page.locator("section").filter({ has: page.getByRole("heading", { name: text.create, exact: true }) }).getByRole("status");
    await expect(feedback).toHaveText(text.failed); await expect(feedback).toBeFocused();
    await page.getByLabel(text.name, { exact: true }).fill("مجتمع Test");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/communities", async (route) => { await held; await route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }); });
    await page.getByRole("button", { name: text.create, exact: true }).click();
    await expect(page.getByRole("button", { name: text.busy, exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    release(); await expect(feedback).toHaveText(text.failed); await expect(feedback).toBeFocused();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "false");
  });
}
test("HTTP boundaries reject unauthenticated/incomplete actors, authority spoofing, cross-user joins, CSRF, and stale sessions", async ({ context, browser }) => {
  expect((await context.request.get("/api/communities")).status()).toBe(401);
  expect((await post(context.request, "/api/communities", { name: "Test", description: "", visibility: "PUBLIC" })).status()).toBe(401);
  await signIn(context);
  expect((await post(context.request, "/api/communities", { name: "Test", description: "", visibility: "PUBLIC" })).status()).toBe(403);
  expect((await post(context.request, "/api/identity/profile", { displayName: "Owner" })).status()).toBe(200);
  const created = await post(context.request, "/api/communities", { name: "Public عام", description: "", visibility: "PUBLIC" });
  expect(created.status()).toBe(201); expect(created.headers()["cache-control"]).toBe("private, no-store");
  const { id } = await created.json() as { id: string };
  const { items } = await (await context.request.get(`/api/communities/${id}/memberships`)).json() as { items: { userId: string }[] };
  const userId = items[0].userId;
  expect((await post(context.request, "/api/communities", { name: "x", description: "", visibility: "PUBLIC", ownerId: userId })).status()).toBe(400);
  expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "leave" })).status()).toBe(409);
  expect((await post(context.request, `/api/communities/${id}/memberships`, { action: "remove", userId }, { Origin: "https://attacker.invalid" })).status()).toBe(403);
  const other = await browser.newContext({ baseURL: origin });
  try {
    await signIn(other, "Member");
    expect((await other.request.get(`/api/communities/${id}`)).status()).toBe(200);
    expect((await other.request.get(`/api/communities/${id}/memberships`)).status()).toBe(403);
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join", userId })).status()).toBe(400);
    for (const action of ["approve", "remove"]) expect((await post(other.request, `/api/communities/${id}/memberships`, { action, userId })).status()).toBe(403);
    await Promise.all([1, 2].map(async () => expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "join" })).status()).toBe(200)));
    expect((await other.request.get(`/api/communities/${id}`)).headers()["cache-control"]).toBe("private, no-store");
    expect((await post(other.request, `/api/communities/${id}/memberships`, { action: "leave" })).status()).toBe(200);
    expect((await post(other.request, "/api/identity/logout", {})).status()).toBe(200);
    expect((await other.request.get(`/api/communities/${id}`)).status()).toBe(401);
  } finally { await other.close(); }
  expect((await context.request.get("/api/communities?after=bad")).status()).toBe(400);
  expect((await post(context.request, "/api/communities", { name: "x".repeat(8193) })).status()).toBe(400);
});
