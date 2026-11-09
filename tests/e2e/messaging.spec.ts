import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { assertDatabaseIdentity, databaseUrl, readManifest } from "../../tools/database/targets";
import { messagingText } from "../../src/i18n/messaging";
import { peopleText } from "../../src/i18n/people";
import { digest, sessionCookie } from "../../src/server/identity/policy";
import { verifyMessagingRestart } from "./messaging-restart";
test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100", headers = { Origin: origin };
async function fixture<T>(run: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw new Error("Owned disposable messaging browser target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try { await client.connect(); return await run(client); }
  catch { throw new Error("Synthetic messaging fixture failed; private diagnostics omitted"); }
  finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
async function account(context: BrowserContext, displayName = `Member ${randomUUID().slice(0, 8)}`) {
  const email = `message.${randomUUID()}@university.test`;
  expect((await context.request.post("/api/identity/request", { headers, data: { email, locale: "en" } })).status()).toBe(202);
  const token = await syntheticTokenFor(email);
  expect((await context.request.post("/api/identity/confirm", { headers, data: { token, locale: "en" } })).status()).toBe(200);
  expect((await context.request.put("/api/people/profile", { headers, data: { displayName } })).status()).toBe(200);
  return fixture(async client => (await client.query<{ id: string; directoryId: string }>('SELECT u.id,p."directoryId" FROM "User" u JOIN "Profile" p ON p."userId"=u.id WHERE u.email=$1', [email])).rows[0]);
}
const input = (body = "Hello مرحبًا 😀 <script>window.messageXSS=1</script>") => ({ body, requestId: randomUUID() });
async function contact(context: BrowserContext, directoryId: string, data = input()) {
  const response = await context.request.post(`/api/people/${directoryId}/messages`, { headers, data });
  expect(response.status()).toBe(200);
  return await response.json() as { conversationId: string; messageId: string };
}
async function seedHistory(conversationId: string, firstId: string, senderId: string, count: number) {
  // Bulk history is synthetic fixture setup on this runner's checked disposable
  // target, not a message-edit API or evidence of bypassing the send budget.
  await fixture(async client => {
    const start = Date.now() - (count + 1) * 1000;
    await client.query('UPDATE "DirectMessage" SET "createdAt"=$1 WHERE id=$2 AND "conversationId"=$3', [new Date(start), firstId, conversationId]);
    for (let index = 1; index < count; index++) await client.query('INSERT INTO "DirectMessage" (id,"conversationId","senderId","submissionKey",body,"createdAt") VALUES ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), conversationId, senderId, digest(randomUUID()), `History ${index}`, new Date(start + index * 1000)]);
  });
}
async function refresh(page: Page, locale: "en" | "ar") {
  await page.getByRole("button", { name: messagingText[locale].refresh, exact: true }).first().click();
  await expect(page.locator(".message-history")).toBeVisible();
}
async function send(page: Page, locale: "en" | "ar", body: string) {
  const text = messagingText[locale];
  await page.getByLabel(text.body, { exact: true }).fill(body);
  await page.getByRole("button", { name: text.send, exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".message-composer [role=status]")).toHaveText(text.saved);
}
test("HTTP boundaries enforce authentication, exact JSON, origin, bounds and private safe errors", async ({ context, browser }) => {
  const other = await browser.newContext(), anonymous = await browser.newContext();
  try {
    await account(context); const target = await account(other);
    const endpoint = `/api/people/${target.directoryId}/messages`;
    expect((await anonymous.request.post(endpoint, { headers, data: input() })).status()).toBe(401);
    expect((await context.request.post(endpoint, { data: input() })).status()).toBe(403);
    expect((await context.request.post(endpoint, { headers: { Origin: "https://attacker.invalid" }, data: input() })).status()).toBe(403);
    for (const data of [{ ...input(), senderId: target.id }, { ...input(), body: "😀".repeat(4001) }, { ...input(), body: "\ud800" }, { ...input(), body: "x".repeat(33000) }, { decision: "accept" }, []]) {
      const result = await context.request.post(endpoint, { headers, data });
      expect(result.status()).toBe(400); expect(await result.json()).toEqual({ ok: false });
      expect(result.headers()["cache-control"]).toBe("private, no-store");
    }
    const p = await contact(context, target.directoryId, input("😀".repeat(4000)));
    const response = await other.request.get(`/api/conversations/${p.conversationId}/messages`);
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain(target.id);
    for (const query of ["?before=bad", "?before=" + p.messageId + "&before=" + p.messageId, "?after=" + p.messageId, "?limit=100"]) {
      expect((await context.request.get(`/api/conversations/${p.conversationId}/messages${query}`)).status()).toBe(400);
    }
    expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "accept", actor: target.id } })).status()).toBe(400);
    expect((await other.request.put(`/api/conversations/${p.conversationId}/block`, { headers, data: { blocked: true, firstBlocked: true } })).status()).toBe(400);
    expect((await context.request.post(endpoint, { headers: { ...headers, "X-Messaging-Scope": target.directoryId }, data: input("Wrong active account") })).status()).toBe(403);
  } finally { await other.close(); await anonymous.close(); }
});
test("JSON media-type casing works across messaging and all shared-reader route families without bypassing guards", async ({ context, browser }) => {
  const other = await browser.newContext(), anonymous = await browser.newContext();
  const mixedType = "Application/JSON; CHARSET=UTF-8";
  async function write(session: BrowserContext, method: "post" | "put", path: string, data: object, expected = 200, contentType = mixedType) {
    const response = await session.request[method](path, { headers: { ...headers, "Content-Type": contentType }, data: JSON.stringify(data) });
    expect(response.status()).toBe(expected); expect(response.headers()["cache-control"]).toBe("private, no-store");
    return response;
  }
  try {
    await account(context); const peer = await account(other);
    await write(context, "put", "/api/people/profile", { displayName: "Casing profile" });
    const community = await (await write(context, "post", "/api/communities", { name: "Casing community", description: "Synthetic shared reader", visibility: "PUBLIC" }, 201)).json() as { id: string };
    await write(other, "post", `/api/communities/${community.id}/memberships`, { action: "join" });
    await write(other, "put", "/api/notifications/preferences", { announcements: true, replies: true, upvotes: true });
    const post = await (await write(context, "post", `/api/communities/${community.id}/posts`, { requestId: randomUUID(), type: "ANNOUNCEMENT", title: "Casing announcement", body: "Synthetic academic content" }, 201)).json() as { id: string };
    const comment = await (await write(other, "post", `/api/communities/${community.id}/posts/${post.id}/comments`, { requestId: randomUUID(), body: "Casing comment" }, 201)).json() as { id: string };
    await write(other, "put", `/api/communities/${community.id}/posts/${post.id}/vote`, { value: 1 });
    await write(context, "put", `/api/communities/${community.id}/posts/${post.id}/comments/${comment.id}/vote`, { value: 1 });
    const inbox = await other.request.get("/api/notifications"); expect(inbox.status()).toBe(200);
    const notification = ((await inbox.json()) as { items: { id: string; kind: string }[] }).items.find(row => row.kind === "ANNOUNCEMENT");
    expect(notification).toBeTruthy();
    await write(other, "post", `/api/notifications/${notification!.id}/open`, {});
    await write(other, "post", "/api/notifications/read-all", {});
    for (const contentType of ["application/json", "APPLICATION/JSON", "aPpLiCaTiOn/JsOn"]) {
      await write(context, "post", `/api/people/${peer.directoryId}/messages`, input(`Media ${contentType}`), 200, contentType);
    }
    for (const contentType of ["application/jsonx", "application/json+problem", "text/json"]) {
      await write(context, "post", "/api/communities", { name: "Denied", description: "", visibility: "PUBLIC" }, 400, contentType);
    }
    await write(context, "post", `/api/people/${peer.directoryId}/messages`, input(), 400, "Application/JSON; charset=iso-8859-1");
    await write(context, "post", `/api/people/${peer.directoryId}/messages`, { ...input(), senderId: peer.id }, 400);
    await write(context, "post", `/api/people/${peer.directoryId}/messages`, input("x".repeat(33000)), 400);
    await write(context, "post", "/api/communities?actor=forged", { name: "Denied", description: "", visibility: "PUBLIC" }, 400);
    await write(anonymous, "post", "/api/communities", { name: "Denied", description: "", visibility: "PUBLIC" }, 401);
    expect((await context.request.post("/api/communities", { headers: { Origin: "https://attacker.invalid", "Content-Type": mixedType }, data: JSON.stringify({ name: "Denied", description: "", visibility: "PUBLIC" }) })).status()).toBe(403);
  } finally { await other.close(); await anonymous.close(); }
});
test("HTTP concurrency preserves original recipient, fifth-message bound and authorized retry reconciliation", async ({ context, browser }) => {
  const other = await browser.newContext(), outsider = await browser.newContext();
  try {
    const a = await account(context), b = await account(other); await account(outsider);
    const starts = await Promise.all([
      context.request.post(`/api/people/${b.directoryId}/messages`, { headers, data: input("A") }),
      other.request.post(`/api/people/${a.directoryId}/messages`, { headers, data: input("B") }),
    ]);
    expect(starts.map(row => row.status()).sort()).toEqual([200, 403]);
    const index = starts.findIndex(row => row.status() === 200), initiator = index === 0 ? context : other, recipient = index === 0 ? other : context;
    const { conversationId: id } = await starts[index].json();
    for (let i = 0; i < 3; i++) expect((await initiator.request.post(`/api/conversations/${id}/messages`, { headers, data: input() })).status()).toBe(200);
    const bodies = [input("fifth A"), input("fifth B")];
    const fifths = await Promise.all(bodies.map(data => initiator.request.post(`/api/conversations/${id}/messages`, { headers, data })));
    expect(fifths.map(row => row.status()).sort()).toEqual([200, 403]);
    const winner = fifths.findIndex(row => row.status() === 200), persisted = await fifths[winner].json();
    const retry = await initiator.request.post(`/api/conversations/${id}/messages`, { headers, data: bodies[winner] });
    expect(retry.status()).toBe(200); expect(await retry.json()).toEqual(persisted);
    expect((await initiator.request.post(`/api/conversations/${id}/messages`, { headers, data: { ...bodies[winner], body: "changed" } })).status()).toBe(409);
    expect((await recipient.request.post(`/api/conversations/${id}/messages`, { headers, data: input() })).status()).toBe(403);
    for (const [method, path, data] of [["get", "messages", undefined], ["post", "messages", input()], ["put", "request", { decision: "accept" }], ["put", "block", { blocked: true }]] as const) {
      expect((await outsider.request[method](`/api/conversations/${id}/${path}`, { headers, ...(data ? { data } : {}) })).status()).toBe(404);
    }
    expect((await outsider.request.get(`/api/conversations?after=${id}`)).status()).toBe(404);
    expect((await recipient.request.put(`/api/conversations/${id}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
    expect((await recipient.request.post(`/api/conversations/${id}/messages`, { headers, data: input() })).status()).toBe(200);
  } finally { await other.close(); await outsider.close(); }
});
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: canonical own-profile URLs omit self-contact while a mixed-case peer URL retains working contact`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale], name = `Self ${randomUUID().slice(0, 8)}`;
    try {
      const own = await account(context, name), peerName = `Peer ${randomUUID().slice(0, 8)}`, peer = await account(other, peerName);
      for (const id of [own.directoryId, own.directoryId.toUpperCase(), own.directoryId.replace(/[a-f]/, letter => letter.toUpperCase())]) {
        await page.goto(`/${locale}/people/${id}`);
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: text.contact, exact: true })).toHaveCount(0);
        await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: text.send, exact: true })).toHaveCount(0);
        await expect(page.locator(".language-list a[lang=en]")).toHaveAttribute("href", `/en/people/${own.directoryId}`);
      }
      expect((await context.request.post(`/api/people/${own.directoryId.toUpperCase()}/messages`, { headers, data: input() })).status()).toBe(404);
      await page.goto(`/${locale}/people/${peer.directoryId.toUpperCase()}`);
      await expect(page.getByRole("heading", { name: peerName, exact: true })).toBeVisible();
      await page.getByLabel(text.body, { exact: true }).fill("Mixed-case peer request");
      await page.getByRole("button", { name: text.send, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/messages\/[a-f0-9-]+$/);
      await expect(page.getByText("Mixed-case peer request", { exact: true })).toBeVisible();
    } finally { await other.close(); }
  });
  test(`${locale}: a mixed-case direct conversation link loads canonical history and can send`, async ({ context, page, browser }) => {
    const other = await browser.newContext();
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId, input("Canonical direct-link history"));
      const mixedId = p.conversationId.replace(/[a-f]/g, (letter, offset: number) => offset % 2 ? letter : letter.toUpperCase());
      await page.goto(`/${locale}/messages/${mixedId}`);
      await expect(page.getByText("Canonical direct-link history", { exact: true })).toBeVisible();
      await send(page, locale, "Canonical direct-link reply");
      const history = await (await other.request.get(`/api/conversations/${p.conversationId}/messages`)).json();
      expect(history.items.filter((row: { body: string }) => row.body === "Canonical direct-link reply")).toHaveLength(1);
    } finally { await other.close(); }
  });
  for (const destination of ["thread", "inbox", "contact"] as const) test(`${locale}: departure before ${destination} mounting pauses until explicit same-account access rechecking`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale], name = `Hidden peer ${randomUUID().slice(0, 8)}`;
    try {
      await account(context); const peer = await account(other, name), p = await contact(context, peer.directoryId, input("Initially hidden private history"));
      let reads = 0;
      page.on("request", request => { if (request.method() === "GET" && new URL(request.url()).pathname.startsWith("/api/conversations")) reads++; });
      await page.addInitScript(() => {
        // Controlled departure occurs before application scripts/hook mounting.
        // No visibility event will arrive during mounting to repeat this state.
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new PageTransitionEvent("pagehide"));
      });
      const path = destination === "thread" ? `messages/${p.conversationId}` : destination === "inbox" ? "messages" : `people/${peer.directoryId}`;
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByText(text.expiredView, { exact: true })).toBeVisible();
      expect(reads).toBe(0); await expect(page.locator(".message-history")).toHaveCount(0);
      await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
      if (destination === "inbox") await expect(page.locator("main .community-list > li")).toHaveCount(0);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.getByText(text.expiredView, { exact: true })).toBeVisible(); expect(reads).toBe(0);
      if (destination === "inbox") {
        // The server shell captured the original scope before tab departure;
        // a replacement account must not publish the old account's list.
        await context.clearCookies(); await account(context, "Replacement hidden account");
      }
      await page.getByRole("button", { name: text.refresh, exact: true }).first().focus(); await page.keyboard.press("Enter");
      if (destination === "inbox") {
        await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
        await expect(page.locator("main .community-list > li")).toHaveCount(0);
      } else if (destination === "thread") {
        await expect(page.getByText("Initially hidden private history", { exact: true })).toBeVisible();
        await expect(page.getByLabel(text.body, { exact: true })).toBeVisible();
      } else await expect(page.getByLabel(text.body, { exact: true })).toBeVisible();
      expect(reads).toBe(1);
    } finally { await other.close(); }
  });
  test(`${locale}: People contact, incoming acceptance, bilingual history, own blocking and explicit reopening work by keyboard`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale], name = `Peer ${randomUUID().slice(0, 8)} طالب`;
    try {
      await account(context); await account(other, name);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`/${locale}/people`);
      await page.getByLabel(peopleText[locale].query, { exact: true }).fill(name);
      await page.getByRole("button", { name: peopleText[locale].submit, exact: true }).click();
      await page.getByRole("link", { name, exact: true }).click(); await expect(page).toHaveURL(/\/people\/[a-f0-9-]+$/);
      await page.getByLabel(text.body, { exact: true }).fill("طلب مرحبًا <script>window.messageXSS=1</script>");
      await page.getByRole("button", { name: text.send, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/messages\/[a-f0-9-]+$/);
      const id = page.url().split("/").at(-1)!;
      await expect(page.getByText(text.pending, { exact: true })).toBeVisible();
      for (let i = 2; i <= 5; i++) await send(page, locale, `رسالة ${i}`);
      await expect(page.getByRole("button", { name: text.send, exact: true })).toBeDisabled();
      const receiver = await other.newPage(); await receiver.goto(`/${locale}/messages`);
      await expect(receiver.getByText(text.incoming, { exact: true })).toBeVisible();
      await receiver.locator(`a[href='/${locale}/messages/${id}']`).click();
      await expect(receiver.getByRole("button", { name: text.send, exact: true })).toBeDisabled();
      await receiver.getByRole("button", { name: text.block, exact: true }).click(); await refresh(receiver, locale);
      await expect(receiver.getByRole("button", { name: text.accept, exact: true })).toHaveCount(0);
      await receiver.getByRole("button", { name: text.reject, exact: true }).focus(); await receiver.keyboard.press("Enter"); await refresh(receiver, locale);
      await expect(receiver.getByText(text.rejected, { exact: true })).toBeVisible();
      await receiver.getByRole("button", { name: text.unblock, exact: true }).click(); await refresh(receiver, locale);
      await receiver.getByRole("button", { name: text.accept, exact: true }).focus(); await receiver.keyboard.press("Enter"); await refresh(receiver, locale);
      await send(receiver, locale, "Accepted reply رد بعد القبول");
      await refresh(page, locale); await expect(page.getByText("Accepted reply رد بعد القبول", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: text.send, exact: true })).toBeEnabled();
      expect(await page.evaluate(() => (window as Window & { messageXSS?: number }).messageXSS)).toBeUndefined();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (locale === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator(".message-history [dir=auto]").first()).toBeVisible();
      await receiver.getByRole("button", { name: text.block, exact: true }).click();
      await page.getByLabel(text.body, { exact: true }).fill("Denied after a peer block");
      await page.getByRole("button", { name: text.send, exact: true }).click();
      await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
      await expect(page.locator(".message-history")).toHaveCount(0);
      await page.reload(); await expect(page.locator(".message-history")).toBeVisible();
    } finally { await other.close(); }
  });
  test(`${locale}: lost send response preserves the original request and explicit retry confirms only one message`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const target = await account(other), p = await contact(context, target.directoryId);
      for (let i = 0; i < 3; i++) expect((await context.request.post(`/api/conversations/${p.conversationId}/messages`, { headers, data: input(`Before fifth ${i}`) })).status()).toBe(200);
      await page.goto(`/${locale}/messages/${p.conversationId}`); await expect(page.locator(".message-history")).toBeVisible();
      let intercepted = false; const attempts: string[] = [];
      await page.route(`**/api/conversations/${p.conversationId}/messages`, async route => {
        if (route.request().method() === "POST") attempts.push((route.request().postDataJSON() as { requestId: string }).requestId);
        if (route.request().method() !== "POST" || intercepted) { await route.continue(); return; }
        intercepted = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed");
      });
      const body = "Ambiguous send رسالة";
      await page.getByLabel(text.body, { exact: true }).fill(body);
      await page.locator(".message-composer form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
      await expect(page.getByText(text.uncertain, { exact: true })).toBeVisible();
      expect(attempts).toHaveLength(1);
      await refresh(page, locale); // The fifth slot is now used; identical retries remain authorized.
      await expect(page.getByLabel(text.body, { exact: true })).toHaveValue(body);
      await expect(page.getByLabel(text.body, { exact: true })).toHaveAttribute("readonly", "");
      await page.getByRole("button", { name: text.retrySend, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator(".message-composer [role=status]")).toHaveText(text.saved);
      expect(attempts).toHaveLength(2); expect(new Set(attempts).size).toBe(1);
      const messages = await other.request.get(`/api/conversations/${p.conversationId}/messages`);
      expect((await messages.json()).items.filter((row: { body: string }) => row.body === body)).toHaveLength(1);
      expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
    } finally { await other.close(); }
  });
  test(`${locale}: an ambiguous first contact retries the same request and opens its single persisted conversation`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other);
      await page.goto(`/${locale}/people/${peer.directoryId}`);
      let intercepted = false;
      await page.route(`**/api/people/${peer.directoryId}/messages`, async route => {
        if (intercepted) { await route.continue(); return; }
        intercepted = true; expect((await route.fetch()).status()).toBe(200); await route.abort("failed");
      });
      await page.getByLabel(text.body, { exact: true }).fill("Initial ambiguous request");
      await page.getByRole("button", { name: text.send, exact: true }).click();
      await expect(page.getByText(text.uncertain, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: text.retrySend, exact: true }).click();
      await expect(page).toHaveURL(/\/messages\/[a-f0-9-]+$/);
      await expect(page.locator(".message-history > li")).toHaveCount(1);
      const list = await other.request.get("/api/conversations"); expect((await list.json()).items).toHaveLength(1);
    } finally { await other.close(); }
  });
  test(`${locale}: tab departure hides history and keeps an ambiguous draft until access is explicitly rechecked`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId);
      await page.goto(`/${locale}/messages/${p.conversationId}`); await expect(page.locator(".message-history")).toBeVisible();
      let held = false;
      await page.route(`**/api/conversations/${p.conversationId}/messages`, async route => {
        if (route.request().method() !== "POST" || held) { await route.continue(); return; }
        held = true; expect((await route.fetch()).status()).toBe(200); await route.abort("failed");
      });
      await page.getByLabel(text.body, { exact: true }).fill("Retained ambiguous draft");
      await page.getByRole("button", { name: text.send, exact: true }).click();
      await expect(page.getByText(text.uncertain, { exact: true })).toBeVisible();
      // Controlled browser lifecycle signal; this is not an observed bfcache hit.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      await expect(page.locator(".message-history")).toHaveCount(0); await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
      await refresh(page, locale);
      await expect(page.getByLabel(text.body, { exact: true })).toHaveValue("Retained ambiguous draft");
      await page.getByRole("button", { name: text.retrySend, exact: true }).click();
      await expect(page.locator(".message-composer [role=status]")).toHaveText(text.saved);
      const rows = await (await other.request.get(`/api/conversations/${p.conversationId}/messages`)).json();
      expect(rows.items.filter((row: { body: string }) => row.body === "Retained ambiguous draft")).toHaveLength(1);
    } finally { await other.close(); }
  });
  test(`${locale}: revocation clears history, paging and compose state instead of presenting an empty conversation`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      const actor = await account(context), peer = await account(other), p = await contact(context, peer.directoryId, input("Private historical message"));
      await page.goto(`/${locale}/messages/${p.conversationId}`); await expect(page.getByText("Private historical message", { exact: true })).toBeVisible();
      await page.getByLabel(text.body, { exact: true }).fill("Private draft");
      await fixture(client => client.query('UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1', [actor.id]));
      await page.getByRole("button", { name: text.refresh, exact: true }).first().click();
      await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
      await expect(page.getByText("Private historical message", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
      await expect(page.getByText(text.emptyHistory, { exact: true })).toHaveCount(0);
      await page.reload(); await expect(page).toHaveURL(`/${locale}/signin`);
    } finally { await other.close(); }
  });
  for (const kind of ["history", "send"] as const) test(`${locale}: delayed ${kind} JSON cannot restore content or navigate after leaving through Next`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId, input("Obsolete private history"));
      await page.addInitScript(({ id, kind }) => {
        const original = window.fetch;
        const gate = { reached: false, release: () => {} };
        (window as Window & { messageGate?: typeof gate }).messageGate = gate;
        let held = false;
        window.fetch = async (url, options) => {
          const response = await original(url, options);
          if (!held && String(url).includes(`/api/conversations/${id}/messages`) && (kind === "send" ? options?.method === "POST" : !options?.method)) {
            held = true; const json = response.json.bind(response);
            response.json = async () => { const parsed: unknown = await json(); gate.reached = true; await new Promise<void>(done => { gate.release = done; }); return parsed; };
          }
          return response;
        };
      }, { id: p.conversationId, kind });
      await page.goto(`/${locale}/messages/${p.conversationId}`);
      if (kind === "send") {
        await expect(page.locator(".message-history")).toBeVisible();
        await page.getByLabel(text.body, { exact: true }).fill("Obsolete send acknowledgement");
        await page.getByRole("button", { name: text.send, exact: true }).click();
      }
      await expect.poll(() => page.evaluate(() => (window as Window & { messageGate?: { reached: boolean } }).messageGate?.reached)).toBe(true);
      await page.locator(".primary-navigation").getByRole("link", { name: text.title, exact: true }).click();
      await expect(page).toHaveURL(`${origin}/${locale}/messages`);
      await page.evaluate(() => (window as Window & { messageGate?: { release(): void } }).messageGate?.release());
      await expect(page.getByRole("link", { name: /^Member / })).toBeVisible();
      await expect(page.locator(".message-history")).toHaveCount(0);
      await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(`${origin}/${locale}/messages`);
    } finally { await other.close(); }
  });
  test(`${locale}: peer profile loss retains readable history and own block controls`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId, input("Preserved correspondence"));
      await fixture(client => client.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [peer.id]));
      await page.goto(`/${locale}/messages/${p.conversationId}`);
      await expect(page.getByRole("heading", { name: text.unknown, exact: true })).toBeVisible();
      await expect(page.getByText("Preserved correspondence", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: text.send, exact: true })).toBeDisabled();
      await page.getByRole("button", { name: text.block, exact: true }).click(); await refresh(page, locale);
      await expect(page.getByRole("button", { name: text.unblock, exact: true })).toBeVisible();
    } finally { await other.close(); }
  });
  test(`${locale}: upward scrolling preserves the visible message, pauses on failure and rechecks revoked access`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale], gate = Promise.withResolvers<void>();
    try {
      const actor = await account(context), peer = await account(other), p = await contact(context, peer.directoryId, input("History 0"));
      expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
      await seedHistory(p.conversationId, p.messageId, actor.id, 65);
      let olderReads = 0, failNext = false;
      await page.route(url => url.pathname === `/api/conversations/${p.conversationId}/messages` && url.searchParams.has("before"), async route => {
        olderReads++;
        if (olderReads === 1) await gate.promise;
        if (failNext) { failNext = false; await route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }); }
        else await route.continue();
      });
      await page.goto(`/${locale}/messages/${p.conversationId}`);
      const box = page.getByRole("region", { name: text.history, exact: true });
      await expect(page.locator(".message-history > li")).toHaveCount(20);
      await expect(page.getByText("History 64", { exact: true })).toBeInViewport();
      await expect(page.getByText("History 0", { exact: true })).toHaveCount(0);
      expect(await box.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop < 2)).toBe(true);
      expect(olderReads).toBe(0); // Opening at the bottom must not automatically drain old pages.
      const older = box.getByRole("button", { name: text.more, exact: true });
      await expect(older).not.toBeInViewport();
      await box.evaluate(element => { element.scrollTop = 150; });
      await box.hover(); await page.mouse.wheel(0, -80);
      await expect.poll(() => olderReads).toBe(1);
      const anchor = await box.evaluate(element => {
        const top = element.getBoundingClientRect().top;
        const row = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.getBoundingClientRect().bottom > top)!;
        return { id: row.dataset.messageId!, offset: row.getBoundingClientRect().top - top };
      });
      gate.resolve();
      await expect(page.locator(".message-history > li")).toHaveCount(40);
      await expect.poll(async () => Math.abs(await box.evaluate((element, saved) => element.querySelector(`[data-message-id="${saved.id}"]`)!.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset, anchor))).toBeLessThan(2);
      expect(olderReads).toBe(1);
      failNext = true;
      await box.evaluate(element => { element.scrollTop = 150; });
      await box.hover(); await page.mouse.wheel(0, -80);
      await expect(page.getByText(text.failed, { exact: true })).toBeVisible();
      await expect(page.locator(".message-history > li")).toHaveCount(40);
      await page.mouse.wheel(0, -500);
      await expect(older).toBeInViewport();
      await page.waitForTimeout(200); // Observe that a failed automatic read does not retry itself.
      expect(olderReads).toBe(2);
      await page.getByRole("button", { name: text.more, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator(".message-history > li")).toHaveCount(60); await expect(box).toBeFocused();
      await fixture(client => client.query('UPDATE "Session" SET "revokedAt"=now() WHERE "userId"=$1', [actor.id]));
      await page.getByRole("button", { name: text.more, exact: true }).click();
      await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
      await expect(page.locator(".message-history")).toHaveCount(0); await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
    } finally { gate.resolve(); await other.close(); }
  });
  test(`${locale}: history paging, unavailable reads and explicit retry retain truthful loading and empty states`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId, input("First page message"));
      expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
      for (let i = 0; i < 20; i++) expect((await context.request.post(`/api/conversations/${p.conversationId}/messages`, { headers, data: input(`Paged message ${i}`) })).status()).toBe(200);
      await page.goto(`/${locale}/messages/${p.conversationId}`);
      await expect(page.locator(".message-history > li")).toHaveCount(20);
      await page.getByRole("button", { name: text.more, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator(".message-history > li")).toHaveCount(21);
      await expect(page.getByText("Paged message 19", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: text.more, exact: true })).toHaveCount(0);
      await page.route(`**/api/conversations/${p.conversationId}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }));
      await page.getByRole("button", { name: text.refresh, exact: true }).first().click();
      await expect(page.getByText(text.failed, { exact: true })).toBeVisible();
      await expect(page.locator(".message-history")).toHaveCount(0); await expect(page.getByText(text.emptyHistory, { exact: true })).toHaveCount(0);
      await page.unroute(`**/api/conversations/${p.conversationId}/messages`);
      await page.getByRole("button", { name: text.refresh, exact: true }).first().focus(); await page.keyboard.press("Enter");
      await expect(page.locator(".message-history > li")).toHaveCount(20);
    } finally { await other.close(); }
  });
  test(`${locale}: conversation paging and account switching do not restore another account's snapshots`, async ({ context, page }) => {
    await account(context); const text = messagingText[locale];
    const peers = await fixture(async client => {
      const rows: string[] = [];
      for (let i = 0; i < 21; i++) {
        const id = randomUUID(), directoryId = randomUUID(), email = `${id}@university.test`;
        await client.query('INSERT INTO "User" (id,email,"emailKey","emailVerifiedAt","updatedAt") VALUES ($1,$2,$2,now(),now())', [id, email]);
        await client.query('INSERT INTO "Profile" ("userId","directoryId","displayName","updatedAt") VALUES ($1,$2,$3,now())', [id, directoryId, `Paged peer ${i}`]); rows.push(directoryId);
      }
      return rows;
    });
    for (const peer of peers) await contact(context, peer);
    await page.goto(`/${locale}/messages`); await expect(page.locator("main .community-list > li")).toHaveCount(20);
    await page.getByRole("button", { name: text.next, exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.locator("main .community-list > li")).toHaveCount(1);
    await context.clearCookies(); await account(context, "Replacement account");
    await page.getByRole("button", { name: text.refresh, exact: true }).first().click();
    await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible(); await expect(page.locator("main .community-list > li")).toHaveCount(0);
    await page.reload(); await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
  });
  test(`${locale}: an old draft cannot be submitted by a different participant after a cookie account switch`, async ({ context, page, browser }) => {
    const other = await browser.newContext(), text = messagingText[locale];
    try {
      await account(context); const peer = await account(other), p = await contact(context, peer.directoryId);
      expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
      await page.goto(`/${locale}/messages/${p.conversationId}`); await expect(page.locator(".message-history")).toBeVisible();
      await page.getByLabel(text.body, { exact: true }).fill("Original account's private draft");
      const session = (await other.cookies()).find(cookie => cookie.name === sessionCookie); expect(Boolean(session)).toBe(true);
      await context.clearCookies(); await context.addCookies([session!]);
      await page.getByRole("button", { name: text.send, exact: true }).click();
      await expect(page.getByText(text.unavailable, { exact: true })).toBeVisible();
      await expect(page.getByLabel(text.body, { exact: true })).toHaveCount(0);
      const history = await (await other.request.get(`/api/conversations/${p.conversationId}/messages`)).json();
      expect(history.items).toHaveLength(1);
    } finally { await other.close(); }
  });
}

test("HTTP scoped paging, expiry, budgets, rejection and bilateral blocks preserve history without implicit sends", async ({ context, browser }) => {
  const other = await browser.newContext(), third = await browser.newContext();
  try {
    const a = await account(context), b = await account(other), p = await contact(context, b.directoryId), foreign = await contact(other, (await account(third)).directoryId);
    const path = `/api/conversations/${p.conversationId}`;
    expect((await other.request.put(`${path}/request`, { headers, data: { decision: "reject" } })).status()).toBe(200);
    expect((await context.request.post(`/api/people/${b.directoryId}/messages`, { headers, data: input() })).status()).toBe(403);
    expect((await context.request.post(`${path}/messages`, { headers, data: input() })).status()).toBe(403);
    for (const session of [context, other]) expect((await session.request.put(`${path}/block`, { headers, data: { blocked: true } })).status()).toBe(200);
    expect((await context.request.put(`${path}/block`, { headers, data: { blocked: false } })).status()).toBe(200);
    expect((await other.request.put(`${path}/request`, { headers, data: { decision: "accept" } })).status()).toBe(403);
    expect((await other.request.put(`${path}/block`, { headers, data: { blocked: false } })).status()).toBe(200);
    expect((await other.request.put(`${path}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
    expect((await (await context.request.get(`${path}/messages`)).json()).items).toHaveLength(1);
    for (let i = 0; i < 20; i++) expect((await context.request.post(`${path}/messages`, { headers, data: input(`Page ${i}`) })).status()).toBe(200);
    const first = await (await context.request.get(`${path}/messages`)).json(); expect(first.items).toHaveLength(20);
    const second = await (await context.request.get(`${path}/messages?before=${first.next}`)).json(); expect(second.items).toHaveLength(1); expect(second.next).toBeNull();
    expect((await context.request.get(`${path}/messages?before=${foreign.messageId}`)).status()).toBe(404);
    await fixture(client => client.query('UPDATE "Session" SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1', [a.id]));
    expect((await context.request.get(`${path}/messages`)).status()).toBe(401);
    expect((await context.request.post(`${path}/messages`, { headers, data: input() })).status()).toBe(401);
    expect((await other.request.get(`${path}/messages`)).status()).toBe(200);
    await fixture(client => client.query('UPDATE "IdentityRateLimit" SET hits=30 WHERE "keyDigest"=$1', [digest(`m4-message-read:${b.id}`)]));
    expect((await other.request.get(`${path}/messages`)).status()).toBe(429);
    expect((await other.request.put(`${path}/block`, { headers, data: { blocked: true } })).status()).toBe(200);
  } finally { await other.close(); await third.close(); }
});

test("long older-history browsing stays bounded and can return to the latest messages", async ({ context, page, browser }) => {
  const other = await browser.newContext(), text = messagingText.en;
  try {
    const actor = await account(context), peer = await account(other), p = await contact(context, peer.directoryId, input("History 0"));
    expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "accept" } })).status()).toBe(200);
    await seedHistory(p.conversationId, p.messageId, actor.id, 225);
    await page.goto(`/en/messages/${p.conversationId}`);
    await expect(page.locator(".message-history > li")).toHaveCount(20);
    for (let batch = 1; batch <= 11; batch++) {
      await page.getByRole("button", { name: text.more, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator(".message-history > li").first().locator("p").last()).toHaveText(`History ${Math.max(0, 225 - (batch + 1) * 20)}`);
    }
    await expect(page.locator(".message-history > li")).toHaveCount(200);
    await expect(page.getByRole("button", { name: text.more, exact: true })).toHaveCount(0);
    await expect(page.getByText(text.newerOutside, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: text.latest, exact: true }).click();
    await expect(page.locator(".message-history > li")).toHaveCount(20);
    await expect(page.getByText("History 224", { exact: true })).toBeInViewport();
  } finally { await other.close(); }
});

// Last: the original Playwright-owned application is deliberately replaced.
test("messages, recipient rejection and independent blocks survive owned application and PostgreSQL restarts", async ({ context, browser }) => {
  test.setTimeout(90000);
  const other = await browser.newContext();
  try {
    await account(context); const peer = await account(other), p = await contact(context, peer.directoryId, input("Durable restart correspondence مراسلة"));
    for (const session of [context, other]) expect((await session.request.put(`/api/conversations/${p.conversationId}/block`, { headers, data: { blocked: true } })).status()).toBe(200);
    expect((await other.request.put(`/api/conversations/${p.conversationId}/request`, { headers, data: { decision: "reject" } })).status()).toBe(200);
    await verifyMessagingRestart([context, other], p.conversationId);
  } finally { await other.close(); }
});
