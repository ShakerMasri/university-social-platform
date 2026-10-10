import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { communityText } from "../../src/i18n/communities";
import { identityText } from "../../src/i18n/identity";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { syntheticTokenFor } from "./synthetic-mail";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
const post = (request: APIRequestContext, path: string, data: object, headers: Record<string, string> = {}) => request.post(path, { data, headers: { Origin: origin, ...headers } });
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some((d) => d.name === name && d.kind === "test" && d.ready)) throw new Error("Owned community browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic community fixture failed; diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => {
  // Isolate pre-existing IP-limiter windows in the owned test DB. No public
  // endpoint or application authorization bypass enables this fixture.
  await fixture((client) => client.query('UPDATE "IdentityRateLimit" SET "startedAt" = now() - interval \'16 minutes\''));
});
async function signIn(context: BrowserContext, displayName?: string) {
  const email = `m3.browser.${randomUUID()}@university.test`;
  expect((await post(context.request, "/api/identity/request", { email, locale: "en" })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await post(context.request, "/api/identity/confirm", { token, locale: "en" })).status()).toBe(200);
  if (displayName) expect((await post(context.request, "/api/identity/profile", { displayName })).status()).toBe(200);
  return fixture(async (client) => (await client.query<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [email])).rows[0].id);
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
test("malformed membership actions return 400 without joining, requesting, leaving or changing a target", async ({ context, browser }) => {
  const ownerId = await signIn(context, "Validation owner");
  const other = await browser.newContext({ baseURL: origin });
  try {
    await signIn(other); // A missing profile must not be the reason for rejection.
    for (const visibility of ["PUBLIC", "PRIVATE"]) {
      const created = await post(context.request, "/api/communities", { name: "Action validation", description: "", visibility });
      expect(created.status()).toBe(201);
      const { id } = await created.json() as { id: string }, path = `/api/communities/${id}/memberships`;
      const listing = async () => (await context.request.get(path)).json();
      const before = await listing();
      expect((await post(other.request, path, { action: "remove", userId: ownerId })).status()).toBe(403);
      for (const action of [["remove"], ["approve"], ["join"], ["leave"], [], {}, null, 1, true, "unknown"]) {
        for (const target of [{}, { userId: ownerId }]) {
          expect((await post(other.request, path, { action, ...target })).status()).toBe(400);
        }
      }
      expect((await post(other.request, path, { userId: ownerId })).status()).toBe(400);
      expect(await listing()).toEqual(before);
      expect((await post(other.request, path, { action: "join" })).status()).toBe(200);
      const joined = await listing();
      for (const action of [["leave"], ["remove"]]) expect((await post(other.request, path, { action, userId: ownerId })).status()).toBe(400);
      expect(await listing()).toEqual(joined);
    }
  } finally { await other.close(); }
});
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: owner distinguishes and independently manages two profileless users and two identical names`, async ({ context, page, browser }) => {
    await signIn(context, "Management owner");
    const created = await post(context.request, "/api/communities", { name: "Distinct targets", description: "", visibility: "PRIVATE" });
    expect(created.status()).toBe(201);
    const { id } = await created.json() as { id: string }, path = `/api/communities/${id}/memberships`;
    const people: { context: BrowserContext; userId: string }[] = [];
    const text = communityText[locale];
    try {
      for (const displayName of [undefined, undefined, "أحمد Alex", "أحمد Alex"]) {
        const person = await browser.newContext({ baseURL: origin });
        people.push({ context: person, userId: await signIn(person, displayName) });
        expect((await post(person.request, path, { action: "join" })).status()).toBe(200);
        expect((await person.request.get(path)).status()).toBe(403);
      }
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(`/${locale}/communities/${id}`);
      await expect(page.getByRole("heading", { name: text.members, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      const listing = async () => {
        const response = await context.request.get(path);
        expect(response.status()).toBe(200);
        const data = await response.json() as { items: { userId: string; status: string; isOwner: boolean }[] };
        expect(JSON.stringify(data)).not.toContain("email");
        return data.items.filter((item) => !item.isOwner).map(({ userId, status }) => ({ userId, status }));
      };
      const expected = people.map(({ userId }) => ({ userId, status: "PENDING" }));
      for (const [index, person] of people.entries()) {
        const row = page.locator(".community-card").filter({ hasText: person.userId });
        await expect(row).toHaveCount(1);
        const identifier = row.locator("p > bdi[dir='ltr']");
        await expect(identifier).toHaveText(person.userId); await expect(identifier).toBeVisible();
        await expect(row).toContainText(index < 2 ? text.joined : "أحمد Alex");
        const approve = row.getByRole("button", { name: `${text.approve} · ${text.userId}: ${person.userId}`, exact: true });
        await expect(approve).toBeVisible(); await approve.focus(); await expect(approve).toBeFocused(); await page.keyboard.press("Enter");
        await expect(row.getByRole("button", { name: `${text.remove} · ${text.userId}: ${person.userId}`, exact: true })).toBeVisible();
        expected[index].status = "MEMBER";
        expect(await listing()).toEqual(expect.arrayContaining(expected));
        expect((await person.context.request.get(`/api/communities/${id}`)).status()).toBe(200);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const person of people) {
        const row = page.locator(".community-card").filter({ hasText: person.userId });
        const remove = row.getByRole("button", { name: `${text.remove} · ${text.userId}: ${person.userId}`, exact: true });
        await remove.focus(); await expect(remove).toBeFocused(); await page.keyboard.press("Enter");
        await expect(row).toHaveCount(0);
        expected.splice(expected.findIndex((item) => item.userId === person.userId), 1);
        expect(await listing()).toHaveLength(expected.length);
        expect(await listing()).toEqual(expect.arrayContaining(expected));
        expect((await person.context.request.get(`/api/communities/${id}`)).status()).toBe(404);
      }
    } finally { for (const person of people) await person.context.close(); }
  });
}
test("creation at membership 500 returns HTTP 429 and inserts neither community nor owner membership", async ({ context }) => {
  const actorId = await signIn(context, "Capped creator");
  const creatorIds = Array.from({ length: 10 }, () => randomUUID());
  const communityIds = Array.from({ length: 500 }, () => randomUUID());
  const ownerIds = communityIds.map((_, index) => creatorIds[Math.floor(index / 50)]);
  await fixture(async (client) => {
    await client.query("BEGIN");
    await client.query('INSERT INTO "User" (id, email, "emailKey", "updatedAt", "emailVerifiedAt") SELECT id, \'cap.\' || id::text || \'@university.test\', \'cap.\' || id::text || \'@university.test\', now(), now() FROM unnest($1::uuid[]) AS id', [creatorIds]);
    await client.query('INSERT INTO "Profile" ("userId", "displayName", "updatedAt") SELECT id, \'Synthetic creator\', now() FROM unnest($1::uuid[]) AS id', [creatorIds]);
    await client.query('INSERT INTO "Community" (id, "ownerId", name, description, visibility) SELECT id, owner, \'Cap fixture\', \'\', \'PUBLIC\' FROM unnest($1::uuid[], $2::uuid[]) AS pair(id, owner)', [communityIds, ownerIds]);
    await client.query('INSERT INTO "CommunityMembership" ("communityId", "userId", status) SELECT id, owner, \'MEMBER\' FROM unnest($1::uuid[], $2::uuid[]) AS pair(id, owner)', [communityIds, ownerIds]);
    await client.query('INSERT INTO "CommunityMembership" ("communityId", "userId", status) SELECT id, $2::uuid, \'MEMBER\' FROM unnest($1::uuid[]) AS id', [communityIds, actorId]);
    await client.query("COMMIT");
  });
  const counts = () => fixture(async (client) => (await client.query('SELECT (SELECT count(*) FROM "Community") AS communities, (SELECT count(*) FROM "CommunityMembership") AS memberships, (SELECT count(*) FROM "CommunityMembership" WHERE "userId" = $1) AS actor_memberships, (SELECT count(*) FROM "Community" WHERE "ownerId" = $1) AS owned', [actorId])).rows[0]);
  const before = await counts();
  expect(before).toMatchObject({ actor_memberships: "500", owned: "0" });
  expect((await post(context.request, "/api/communities", { name: "Over cap", description: "", visibility: "PUBLIC" })).status()).toBe(429);
  expect(await counts()).toEqual(before);
});
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: onboarding navigation works before and after the first profile save without reload`, async ({ context, page }) => {
    const text = communityText[locale], identity = identityText[locale];
    await signIn(context);
    await page.goto(`/${locale}/profile`);
    const name = page.getByLabel(identity.name, { exact: true });
    await expect(name).toHaveValue("");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    // The marker survives client navigation/save, but would disappear on a reload.
    await page.evaluate(() => { document.documentElement.dataset.onboardingDocument = "same-document"; });
    const communities = page.getByRole("link", { name: text.title, exact: true });
    await expect(communities).toBeVisible(); await communities.focus(); await expect(communities).toBeFocused(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/communities`);
    await expect(page.getByRole("heading", { name: text.title, exact: true })).toBeVisible();
    await expect(page.getByText(text.profileRequired, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: text.create, exact: true })).toHaveCount(0);
    const discovery = await context.request.get("/api/communities");
    expect(discovery.status()).toBe(200);
    expect(await discovery.json()).toMatchObject({ canCreate: false, items: expect.any(Array) });
    expect((await post(context.request, "/api/communities", { name: "Profileless creation", description: "", visibility: "PUBLIC" })).status()).toBe(403);
    const profile = page.getByRole("link", { name: text.profile, exact: true });
    await profile.focus(); await expect(profile).toBeFocused(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/profile`);
    await expect(name).toHaveValue("");
    const save = page.getByRole("button", { name: identity.save, exact: true }), feedback = page.locator("#identity-feedback");
    await name.fill(" "); await save.focus(); await page.keyboard.press("Enter");
    await expect(feedback).toHaveText(identity.invalidName); await expect(feedback).toBeFocused();
    await expect(communities).toBeVisible();
    await name.fill("أحمد Onboarding 😀");
    await page.route("**/api/identity/profile", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }));
    await save.focus(); await page.keyboard.press("Enter");
    await expect(feedback).toHaveText(identity.failed); await expect(feedback).toBeFocused();
    expect(await (await context.request.get("/api/communities")).json()).toMatchObject({ canCreate: false });
    await expect(communities).toBeVisible();
    await page.unroute("**/api/identity/profile");
    await save.focus(); await page.keyboard.press("Enter");
    await expect(feedback).toHaveText(identity.saved); await expect(feedback).toBeFocused();
    await expect(communities).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-onboarding-document", "same-document");
    await communities.focus(); await expect(communities).toBeFocused(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${origin}/${locale}/communities`);
    await expect(page.getByRole("heading", { name: text.create, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: text.create, exact: true })).toBeEnabled();
    await expect(page.getByText(text.profileRequired, { exact: true })).toHaveCount(0);
    const eligible = await context.request.get("/api/communities");
    expect(eligible.status()).toBe(200); expect(await eligible.json()).toMatchObject({ canCreate: true });
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.locator("html")).toHaveAttribute("data-onboarding-document", "same-document");
  });
}
