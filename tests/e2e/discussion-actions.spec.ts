import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { syntheticTokenFor } from "./synthetic-mail";
import { commentText } from "../../src/i18n/comments";
import { replyText } from "../../src/i18n/replies";
import { voteText } from "../../src/i18n/votes";
import { notificationText } from "../../src/i18n/notifications";
import { paginationText } from "../../src/i18n/pagination";

test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";
async function fixture<T>(operation: (client: Client) => Promise<T>) {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(row => row.name === name && row.kind === "test" && row.ready)) throw Error("Owned disposable discussion target required");
  const url = databaseUrl(manifest, name!, "migration"); await assertDatabaseIdentity(url, manifest, "migration"); const client = new Client({ connectionString: url });
  try { await client.connect(); return await operation(client); } catch { throw Error("Synthetic discussion fixture failed; sensitive diagnostics omitted"); } finally { await client.end(); }
}
test.beforeEach(async () => { await fixture(client => client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'')); });
async function post(context: BrowserContext, path: string, data: object, status = 201) {
  const response = await context.request.post(path, { data, headers: { Origin: origin } }); expect(response.status()).toBe(status); return response.json() as Promise<{ id: string }>;
}
async function signIn(context: BrowserContext, locale: "en" | "ar", profile = true) {
  const email = `discussion.${randomUUID()}@university.test`;
  await post(context, "/api/identity/request", { email, locale }, 202); await post(context, "/api/identity/confirm", { token: await syntheticTokenFor(email), locale }, 200);
  if (profile) await post(context, "/api/identity/profile", { displayName: "Discussion author طالب" }, 200);
}
async function setup(context: BrowserContext, locale: "en" | "ar", visibility = "PUBLIC") {
  await signIn(context, locale);
  const { id } = await post(context, "/api/communities", { name: "Discussion action study", description: "Synthetic academic space", visibility });
  const { id: postId } = await post(context, `/api/communities/${id}/posts`, { requestId: randomUUID(), type: "QUESTION", title: "An accessible discussion نقاش", body: "Synthetic question" });
  const { id: commentId } = await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Root comment with no replies" });
  return { id, postId, commentId };
}

// Deliver a real, server-confirmed response only when the test releases it. Buffer
// the response first so even aborting fetch cannot replace the currency checks.
async function delayResponse(page: Page, path: string, stage: "headers" | "body") {
  await page.addInitScript(({ path, stage }) => {
    const original = window.fetch;
    let delayed = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (!delayed && response.url.endsWith(path)) {
        delayed = true;
        const value: unknown = await response.json();
        const wait = async () => {
          document.documentElement.dataset.notificationWaiting = "true";
          await new Promise<void>(resolve => document.addEventListener("release-notification", () => resolve(), { once: true }));
          document.documentElement.dataset.notificationReleased = "true";
        };
        response.json = async () => { if (stage === "body") await wait(); return value; };
        if (stage === "headers") await wait();
      }
      return response;
    };
  }, { path, stage });
}
async function releaseResponse(page: Page) {
  await page.evaluate(async () => {
    document.dispatchEvent(new Event("release-notification"));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator("html")).toHaveAttribute("data-notification-released", "true");
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function holdRefresh(page: Page, documentPath: string) {
  const started = deferred(), held = deferred();
  await page.route(url => url.pathname === documentPath, async route => {
    if (route.request().headers().rsc !== "1") { await route.continue(); return; }
    const response = await route.fetch(); started.release(); await held.promise; await route.fulfill({ response });
  });
  return { started: started.promise, release: held.release };
}
async function pagedPrivateReplies(owner: BrowserContext, member: BrowserContext, locale: "en" | "ar") {
  const target = await setup(owner, locale, "PRIVATE"), { id, postId, commentId } = target;
  await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
  const userId = await fixture(async client => (await client.query<{ userId: string }>('SELECT "userId" FROM "CommunityMembership" WHERE "communityId"=$1 AND status=\'PENDING\'', [id])).rows[0].userId);
  await post(owner, `/api/communities/${id}/memberships`, { action: "approve", userId }, 200);
  const ids = Array.from({ length: 21 }, () => randomUUID());
  await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","submissionKey",body,"rootId","replyToId") SELECT id,$2::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Private paged reply\',$3::uuid,$3::uuid FROM unnest($1::uuid[]) id', [ids, postId, commentId]));
  return { ...target, userId, path: `/api/communities/${id}/posts/${postId}/comments`, documentPath: `/${locale}/communities/${id}/posts/${postId}` };
}

// Transport-status routing coverage; the private-revocation tests below obtain
// their 404 from the actual server. These also check recovery on a fresh snapshot.
for (const status of [401, 403]) for (const loader of ["initial", "pagination"] as const) {
  test(`en: ${status} ${loader} denial blocks stale Reply until a fresh authorized snapshot`, async ({ context, browser }) => {
    const member = await browser.newContext({ baseURL: origin }); let refresh: Awaited<ReturnType<typeof holdRefresh>> | undefined;
    try {
      const { commentId, path, documentPath } = await pagedPrivateReplies(context, member, "en"), page = await member.newPage(), text = replyText.en, endpoint = `${path}/${commentId}/replies`;
      await page.goto(documentPath);
      const root = page.locator(`#comment-${commentId}`), thread = root.locator(".."), body = thread.getByRole("textbox", { name: text.body, exact: true });
      if (loader === "pagination") { await thread.getByRole("button", { name: text.show, exact: true }).click(); await expect(thread.locator(".comment-replies article")).toHaveCount(20); }
      await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Discard on explicit denial");
      refresh = await holdRefresh(page, documentPath);
      const pattern = loader === "initial" ? `**${endpoint}` : `**${endpoint}?after=*`;
      await page.route(pattern, route => route.fulfill({ status, json: {} }));
      await thread.getByRole("button", { name: loader === "initial" ? text.show : text.more, exact: true }).click(); await refresh.started;
      await expect(thread.locator(".comment-composer")).toHaveCount(0);
      await expect(root.getByRole("button", { name: text.reply, exact: true })).toHaveCount(0);
      await expect(thread.getByRole("alert")).toHaveText(text.failed);
      await page.unroute(pattern); refresh.release();
      await expect(root.getByRole("button", { name: text.reply, exact: true })).toBeEnabled();
      await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toBeFocused(); await expect(body).toHaveValue("");
    } finally { refresh?.release(); await member.close(); }
  });
}

for (const locale of ["en", "ar"] as const) {
  for (const stage of ["headers", "body"] as const) {
    test(`${locale}: paginated denial clears every composer before a held ${stage} publication returns`, async ({ context, browser }) => {
      const member = await browser.newContext({ baseURL: origin }); let refresh: Awaited<ReturnType<typeof holdRefresh>> | undefined;
      try {
        const { id, postId, commentId, userId, path, documentPath } = await pagedPrivateReplies(context, member, locale), page = await member.newPage(), text = replyText[locale];
        // Hold the second UI publication; the first establishes local content
        // that denial must clear alongside visible and hidden drafts.
        await page.goto(documentPath); await page.setViewportSize({ width: 320, height: 900 });
        const root = page.locator(`#comment-${commentId}`), thread = root.locator(".."), body = thread.getByRole("textbox", { name: text.body, exact: true });
        await thread.getByRole("button", { name: text.show, exact: true }).click(); await expect(thread.locator(".comment-replies article")).toHaveCount(20);
        const first = await (await member.request.get(`${path}/${commentId}/replies`)).json() as { items: { id: string }[] };
        await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Local publication cleared on denial");
        await thread.getByRole("button", { name: text.publish, exact: true }).click(); await expect(thread.getByText("Local publication cleared on denial", { exact: true })).toBeVisible();
        for (const [index, draft] of [[0, "Hidden unsent draft"], [1, "Another unsent draft"]] as const) {
          await page.locator(`#comment-${first.items[index].id}`).getByRole("button", { name: text.reply, exact: true }).click(); await body.fill(draft);
        }
        // Install only after the page is loaded: no application or router mocks.
        await page.evaluate(({ path, stage }) => {
          const original = window.fetch;
          window.fetch = async (...args) => {
            const response = await original(...args);
            if (response.url.endsWith(path) && args[1]?.method === "POST") {
              const value: unknown = await response.json();
              const wait = async () => {
                document.documentElement.dataset.notificationWaiting = "true";
                await new Promise<void>(resolve => document.addEventListener("release-notification", () => resolve(), { once: true }));
                document.documentElement.dataset.notificationReleased = "true";
              };
              response.json = async () => { if (stage === "body") await wait(); return value; };
              if (stage === "headers") await wait();
            }
            return response;
          };
        }, { path, stage });
        const marker = "Held paginated reply";
        await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill(marker); await thread.getByRole("button", { name: text.publish, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-notification-waiting", "true");
        await post(context, `/api/communities/${id}/memberships`, { action: "remove", userId }, 200);
        refresh = await holdRefresh(page, documentPath);
        const denied = page.waitForResponse(response => response.url().includes(`${path}/${commentId}/replies?after=`) && response.status() === 404);
        await thread.getByRole("button", { name: text.more, exact: true }).focus(); await page.keyboard.press("Enter"); await denied; await refresh.started;
        await expect(thread.locator(".comment-composer")).toHaveCount(0);
        await expect(thread.getByText("Local publication cleared on denial", { exact: true })).toHaveCount(0);
        await expect(root.getByRole("button", { name: text.reply, exact: true })).toHaveCount(0);
        await expect(thread.locator(".comment-replies article")).toHaveCount(0);
        const focus = page.locator(`header a[hreflang='${locale}']`); await focus.focus();
        await releaseResponse(page);
        await expect(focus).toBeFocused(); await expect(thread.locator(".comment-composer")).toHaveCount(0);
        await expect(thread.getByRole("status")).toHaveCount(0); await expect(thread.getByText(marker, { exact: true })).toHaveCount(0);
        // Retrying a read under stale page props must not reopen any composer.
        await thread.getByRole("button", { name: text.show, exact: true }).click(); await expect(thread.getByRole("alert")).toHaveText(text.failed);
        await expect(root.getByRole("button", { name: text.reply, exact: true })).toHaveCount(0);
        refresh.release(); await expect(root).toHaveCount(0);
        await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200); await post(context, `/api/communities/${id}/memberships`, { action: "approve", userId }, 200);
        const saved = await fixture(async client => (await client.query<{ body: string; replyToId: string }>('SELECT body,"replyToId" FROM "Comment" WHERE "postId"=$1 AND body=ANY($2::text[])', [postId, [marker, "Local publication cleared on denial"]])).rows);
        expect(saved).toHaveLength(2); expect(saved.filter(row => row.body === marker)).toEqual([{ body: marker, replyToId: commentId }]);
        expect(await fixture(async client => (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM "Notification" n JOIN "Comment" c ON c.id=n."commentId" WHERE c."postId"=$1 AND c.body=$2 AND n.kind=\'COMMENT\'', [postId, marker])).rows[0].count)).toBe(1);
        await page.reload(); await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toBeFocused(); await expect(body).toHaveValue("");
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      } finally { refresh?.release(); await member.close(); }
    });
  }

  for (const failure of ["network", "503"] as const) {
    test(`${locale}: a transient paginated ${failure} preserves drafts and ambiguous retry state`, async ({ context, browser }) => {
      const member = await browser.newContext({ baseURL: origin });
      try {
        const { commentId, path, documentPath } = await pagedPrivateReplies(context, member, locale), page = await member.newPage(), text = replyText[locale], comments = commentText[locale];
        await page.goto(documentPath);
        const root = page.locator(`#comment-${commentId}`), thread = root.locator(".."), body = thread.getByRole("textbox", { name: text.body, exact: true });
        await thread.getByRole("button", { name: text.show, exact: true }).click();
        const first = await (await member.request.get(`${path}/${commentId}/replies`)).json() as { items: { id: string }[] };
        await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Confirmed before transient read"); await thread.getByRole("button", { name: text.publish, exact: true }).click();
        await expect(thread.getByText("Confirmed before transient read", { exact: true })).toBeVisible();
        await page.locator(`#comment-${first.items[0].id}`).getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Retain hidden draft");
        await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Ambiguous retry survives transient read");
        const attempts: { requestId: string; replyToId: string }[] = [];
        await page.route(`**${path}`, async route => {
          if (route.request().method() !== "POST") { await route.continue(); return; }
          attempts.push(route.request().postDataJSON()); const response = await route.fetch();
          if (attempts.length === 1) await route.abort("failed"); else await route.fulfill({ response });
        });
        await thread.getByRole("button", { name: text.publish, exact: true }).click(); await expect(thread.getByRole("status").filter({ hasText: comments.failed })).toBeFocused();
        await page.route(`**${path}/${commentId}/replies?after=*`, route => failure === "network" ? route.abort("failed") : route.fulfill({ status: 503, json: {} }));
        await thread.getByRole("button", { name: text.more, exact: true }).click(); await expect(thread.getByRole("alert")).toHaveText(paginationText[locale].failed);
        await expect(body).toHaveValue("Ambiguous retry survives transient read"); await expect(thread.getByText("Confirmed before transient read", { exact: true })).toBeVisible();
        await page.locator(`#comment-${first.items[0].id}`).getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Retain hidden draft");
        await root.getByRole("button", { name: text.reply, exact: true }).click(); await thread.getByRole("button", { name: text.publish, exact: true }).click(); await expect(body).toHaveValue("");
        expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]);
        await page.unroute(`**${path}/${commentId}/replies?after=*`);
        await thread.getByRole("button", { name: paginationText[locale].retry, exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(thread.locator(".comment-replies article")).toHaveCount(23); await expect(thread.locator(".comment-replies article:focus")).toHaveCount(1);
        expect((await (await member.request.get(`${path}/${commentId}/replies?after=${first.items.at(-1)!.id}`)).json()).items.filter((row: { body: string }) => row.body === "Ambiguous retry survives transient read")).toHaveLength(1);
      } finally { await member.close(); }
    });
  }

  for (const stage of ["headers", "body"] as const) {
    test(`${locale}: access denial invalidates a publication held during ${stage}`, async ({ context, browser }) => {
      const { id, postId, commentId } = await setup(context, locale, "PRIVATE"), member = await browser.newContext({ baseURL: origin });
      let releaseRefresh = () => {};
      try {
        await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
        const userId = await fixture(async client => (await client.query<{ userId: string }>('SELECT "userId" FROM "CommunityMembership" WHERE "communityId"=$1 AND status=\'PENDING\'', [id])).rows[0].userId);
        await post(context, `/api/communities/${id}/memberships`, { action: "approve", userId }, 200);
        const page = await member.newPage(), path = `/api/communities/${id}/posts/${postId}/comments`, documentPath = `/${locale}/communities/${id}/posts/${postId}`;
        await page.addInitScript(({ path, stage }) => {
          const original = window.fetch;
          window.fetch = async (...args) => {
            const response = await original(...args);
            if (response.url.endsWith(path) && args[1]?.method === "POST") {
              const value: unknown = await response.json();
              const wait = async () => {
                document.documentElement.dataset.publicationWaiting = "true";
                await new Promise<void>(resolve => document.addEventListener("release-publication", () => resolve(), { once: true }));
                document.documentElement.dataset.publicationReleased = "true";
              };
              response.json = async () => { if (stage === "body") await wait(); return value; };
              if (stage === "headers") await wait();
            }
            return response;
          };
        }, { path, stage });
        await post(context, path, { requestId: randomUUID(), body: "Existing private reply", replyToId: commentId });
        await page.goto(documentPath);
        const thread = page.locator(`#comment-${commentId}`).locator(".."), text = replyText[locale], marker = "Confirmed before private removal";
        await thread.getByRole("button", { name: text.reply, exact: true }).click();
        await thread.getByRole("textbox", { name: text.body, exact: true }).fill(marker);
        await thread.getByRole("button", { name: text.publish, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-publication-waiting", "true");
        const before = await (await member.request.get(`${path}/${commentId}/replies`)).json() as { items: { body: string }[] };
        expect(before.items.filter(row => row.body === marker)).toEqual([expect.objectContaining({ body: marker })]);
        await post(context, `/api/communities/${id}/memberships`, { action: "remove", userId }, 200);
        let refreshStarted = () => {};
        const refreshing = new Promise<void>(resolve => { refreshStarted = resolve; }), held = new Promise<void>(resolve => { releaseRefresh = resolve; });
        await page.route(url => url.pathname === documentPath, async route => {
          if (route.request().headers().rsc !== "1") { await route.continue(); return; }
          const response = await route.fetch(); refreshStarted(); await held; await route.fulfill({ response });
        });
        const denied = page.waitForResponse(response => response.url().endsWith(`${path}/${commentId}/replies`) && response.status() === 404);
        await thread.getByRole("button", { name: text.show, exact: true }).click(); await denied; await refreshing;
        await expect(thread.getByRole("textbox")).toHaveCount(0);
        await expect(thread.getByRole("alert")).toHaveText(text.failed);
        await page.evaluate(async () => {
          document.dispatchEvent(new Event("release-publication"));
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        await expect(page.locator("html")).toHaveAttribute("data-publication-released", "true");
        await expect(thread.getByText(marker, { exact: true })).toHaveCount(0);
        await expect(thread.getByRole("textbox")).toHaveCount(0);
        expect((await member.request.get(`${path}/${commentId}/replies`)).status()).toBe(404);
        releaseRefresh(); await expect(page.locator(`#comment-${commentId}`)).toHaveCount(0);
        // The confirmed write still exists. Freshly approved access may read it;
        // invalidating client callbacks does not roll back the transaction.
        await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
        await post(context, `/api/communities/${id}/memberships`, { action: "approve", userId }, 200);
        const after = await (await member.request.get(`${path}/${commentId}/replies`)).json() as { items: { body: string }[] };
        expect(after.items.filter(row => row.body === marker)).toEqual([expect.objectContaining({ body: marker })]);
      } finally { releaseRefresh(); await member.close(); }
    });
  }

  for (const submission of ["draft", "in-flight", "ambiguous"] as const) {
    test(`${locale}: chronological pagination preserves a recent root's ${submission} reply`, async ({ context, page }) => {
      const { id, postId } = await setup(context, locale), text = commentText[locale], replies = replyText[locale], path = `/api/communities/${id}/posts/${postId}/comments`;
      const ids = Array.from({ length: 20 }, () => randomUUID());
      await fixture(client => client.query('INSERT INTO "Comment" (id,"postId","submissionKey",body) SELECT id,$2::uuid,replace(id::text,\'-\',\'\')||replace(id::text,\'-\',\'\'),\'Older chronology root\' FROM unnest($1::uuid[]) id', [ids, postId]));
      await page.addInitScript(() => { Object.defineProperty(window, "IntersectionObserver", { value: undefined }); });
      await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      const section = page.getByRole("region", { name: text.title, exact: true }); await expect(section.getByRole("article")).toHaveCount(20);
      await section.getByRole("textbox", { name: text.body, exact: true }).fill("New root beyond the first page");
      const created = page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === "POST");
      await section.getByRole("button", { name: text.publish, exact: true }).click();
      const rootId = ((await (await created).json()) as { id: string }).id, root = page.locator(`#comment-${rootId}`), thread = root.locator("..");
      await expect(page.getByRole("region", { name: text.justPublished }).locator(`#comment-${rootId}`)).toBeVisible();
      await root.getByRole("button", { name: replies.reply, exact: true }).click();
      const body = thread.getByRole("textbox", { name: replies.body, exact: true }), marker = "Keep reply through chronology مسودة";
      await body.fill(marker);
      let release = () => {}, written = () => {};
      const held = new Promise<void>(resolve => { release = resolve; }), confirmed = new Promise<void>(resolve => { written = resolve; });
      const attempts: { requestId: string; replyToId: string }[] = [];
      if (submission !== "draft") await page.route(`**${path}`, async route => {
        if (route.request().method() !== "POST") { await route.continue(); return; }
        attempts.push(route.request().postDataJSON());
        const response = await route.fetch(); written();
        if (attempts.length === 1 && submission === "in-flight") await held;
        if (attempts.length === 1 && submission === "ambiguous") await route.abort("failed");
        else await route.fulfill({ response });
      });
      try {
        if (submission !== "draft") {
          await thread.getByRole("button", { name: replies.publish, exact: true }).click(); await confirmed;
          if (submission === "ambiguous") await expect(thread.getByRole("status").filter({ hasText: text.failed })).toBeFocused();
        }
        const first = await (await context.request.get(path)).json() as { next: string };
        const next = await (await context.request.get(`${path}?after=${first.next}`)).json() as { items: { id: string }[] };
        expect(next.items).toHaveLength(2); expect(next.items[1].id).toBe(rootId);
        await section.getByRole("button", { name: text.more, exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(section.getByRole("article")).toHaveCount(22);
        await expect(section.getByRole("region", { name: text.justPublished })).toHaveCount(0);
        await expect(page.locator(`#comment-${next.items[0].id}`)).toBeFocused();
        await expect(body).toBeVisible(); await expect(body).toHaveValue(marker);
        if (submission === "in-flight") { await expect(body).toBeDisabled(); release(); }
        else {
          await root.getByRole("button", { name: replies.reply, exact: true }).click(); await expect(body).toBeFocused();
          await thread.getByRole("button", { name: replies.publish, exact: true }).click();
        }
        await expect(thread.getByText(marker, { exact: true })).toBeVisible(); await expect(body).toHaveValue(""); await expect(body).toBeEnabled();
        if (submission === "ambiguous") { expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]); }
        const saved = await (await context.request.get(`${path}/${rootId}/replies`)).json() as { items: { body: string; replyToId: string }[] };
        expect(saved.items).toEqual([expect.objectContaining({ body: marker, replyToId: rootId })]);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      } finally { release(); }
    });
  }

  test(`${locale}: an invalid notification destination focuses failure and permits a safe retry`, async ({ context, browser, page }) => {
    const { id, postId, commentId } = await setup(context, locale), member = await browser.newContext({ baseURL: origin });
    try {
      await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
      const { id: replyId } = await post(member, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Retry notification target", replyToId: commentId });
      const inbox = await (await context.request.get("/api/notifications")).json() as { items: { id: string }[] };
      const notificationId = inbox.items[0].id, path = `/api/notifications/${notificationId}/open`;
      await page.route(`**${path}`, async route => {
        const response = await route.fetch(), row: unknown = await response.json();
        await route.fulfill({ response, json: { ...(row as object), communityId: "invalid" } });
      });
      await page.goto(`/${locale}/notifications`);
      const open = page.locator(`#notification-${notificationId}`).getByRole("button", { name: notificationText[locale].open, exact: true });
      await open.click(); await expect(page.getByRole("main").getByRole("status")).toHaveText(notificationText[locale].failed);
      await expect(page.getByRole("main").getByRole("status")).toBeFocused(); await expect(open).toBeEnabled();
      await page.unroute(`**${path}`); await open.click();
      await expect(page.locator(`#comment-${replyId}`)).toBeFocused();
    } finally { await member.close(); }
  });

  test(`${locale}: a delayed mark-all cannot refresh or focus a later profile page`, async ({ context, browser, page }) => {
    const { id, postId, commentId } = await setup(context, locale), member = await browser.newContext({ baseURL: origin });
    try {
      await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
      await post(member, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Unread before mark-all", replyToId: commentId });
      await delayResponse(page, "/api/notifications/read-all", "headers"); await page.goto(`/${locale}/notifications`);
      await page.getByRole("button", { name: notificationText[locale].markAll, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-notification-waiting", "true");
      expect((await (await context.request.get("/api/notifications")).json()).unread).toBe(0);
      await page.locator(`.primary-navigation a[href='/${locale}/profile']`).click();
      await expect(page.locator("#display-name")).toBeEnabled(); await page.locator("#display-name").focus();
      const refreshes: string[] = [];
      page.on("request", request => {
        if (new URL(request.url()).pathname === `/${locale}/profile` && request.headers().rsc === "1") refreshes.push("profile refresh");
      });
      await releaseResponse(page);
      await expect(page).toHaveURL(`${origin}/${locale}/profile`); await expect(page.locator("#display-name")).toBeFocused();
      expect(refreshes).toEqual([]);
      await page.locator(`.primary-navigation a[href='/${locale}/notifications']`).click();
      await expect(page.getByText(`${notificationText[locale].unread}: ${(0).toLocaleString(locale)}`, { exact: true })).toBeVisible();
    } finally { await member.close(); }
  });

  test(`${locale}: reply drafts survive target round trips and every Reply activation refocuses`, async ({ context, page }) => {
    const { id, postId, commentId } = await setup(context, locale), text = replyText[locale];
    const { id: replyId } = await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Existing reply", replyToId: commentId });
    await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const root = page.locator(`#comment-${commentId}`), thread = root.locator("..");
    await thread.getByRole("button", { name: text.show, exact: true }).click();
    const child = page.locator(`#comment-${replyId}`), body = thread.getByRole("textbox", { name: text.body, exact: true });
    for (const [card, draft] of [[root, "Root draft مسودة"], [child, "Reply draft رد"]] as const) {
      const reply = card.getByRole("button", { name: text.reply, exact: true });
      await reply.focus(); await page.keyboard.press("Enter"); await expect(body).toBeFocused(); await body.fill(draft);
      await reply.click(); await expect(body).toBeFocused(); await expect(body).toHaveValue(draft);
      await reply.focus(); await page.keyboard.press("Enter"); await expect(body).toBeFocused(); await expect(body).toHaveValue(draft);
    }
    await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Root draft مسودة");
    await child.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Reply draft رد");
    await thread.getByRole("button", { name: text.cancel, exact: true }).click(); await expect(root).toBeFocused();
    await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Root draft مسودة");
    await child.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${locale}: reply retry keys stay with their addressee across switching and conflicts`, async ({ context, page }) => {
    const { id, postId, commentId } = await setup(context, locale), text = replyText[locale], comments = commentText[locale];
    const path = `/api/communities/${id}/posts/${postId}/comments`;
    const { id: replyId } = await post(context, path, { requestId: randomUUID(), body: "Existing addressee", replyToId: commentId });
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const root = page.locator(`#comment-${commentId}`), thread = root.locator(".."), child = page.locator(`#comment-${replyId}`);
    await thread.getByRole("button", { name: text.show, exact: true }).click();
    const body = thread.getByRole("textbox", { name: text.body, exact: true }), publish = thread.getByRole("button", { name: text.publish, exact: true });
    const attempts: { requestId: string; replyToId: string; body: string }[] = [];
    let loseResponse = true;
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      attempts.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (loseResponse) { loseResponse = false; await route.abort("failed"); }
      else await route.fulfill({ response });
    });
    await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Ambiguous root reply"); await publish.click();
    await expect(thread.getByRole("status").filter({ hasText: comments.failed })).toBeFocused();
    await child.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Child addressed reply"); await publish.click();
    await expect(thread.getByText("Child addressed reply", { exact: true })).toBeVisible();
    await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Ambiguous root reply"); await publish.click();
    await expect(body).toHaveValue("");
    expect(attempts[0].requestId).toBe(attempts[2].requestId); expect(attempts[1].requestId).not.toBe(attempts[0].requestId);
    expect(attempts.map(row => row.replyToId)).toEqual([commentId, replyId, commentId]);
    // Editing after an ambiguous write keeps the old key until the server's
    // 409 confirms a mismatch, then the next explicit retry uses a new key.
    loseResponse = true; await body.fill("Original ambiguous text"); await publish.click();
    await expect(thread.getByRole("status").filter({ hasText: comments.failed })).toBeFocused();
    await child.getByRole("button", { name: text.reply, exact: true }).click();
    await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Edited after ambiguity"); await publish.click();
    await expect(thread.getByRole("status").filter({ hasText: comments.conflict })).toBeFocused(); await expect(body).toHaveValue("Edited after ambiguity");
    await publish.click(); await expect(body).toHaveValue("");
    expect(attempts[3].requestId).toBe(attempts[4].requestId); expect(attempts[5].requestId).not.toBe(attempts[4].requestId);
    const replies = await (await context.request.get(`${path}/${commentId}/replies`)).json() as { items: { body: string; replyToId: string }[] };
    for (const [draft, target] of [["Ambiguous root reply", commentId], ["Child addressed reply", replyId], ["Original ambiguous text", commentId], ["Edited after ambiguity", commentId]]) {
      expect(replies.items.filter(row => row.body === draft)).toEqual([expect.objectContaining({ replyToId: target })]);
    }
  });

  test(`${locale}: a late reply confirmation cannot clear or focus another target's draft`, async ({ context, page }) => {
    const { id, postId, commentId } = await setup(context, locale), text = replyText[locale];
    const path = `/api/communities/${id}/posts/${postId}/comments`;
    const { id: replyId } = await post(context, path, { requestId: randomUUID(), body: "Existing reply target", replyToId: commentId });
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    const root = page.locator(`#comment-${commentId}`), thread = root.locator(".."), child = page.locator(`#comment-${replyId}`), body = thread.getByRole("textbox", { name: text.body, exact: true });
    await thread.getByRole("button", { name: text.show, exact: true }).click();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let confirmed!: () => void;
    const written = new Promise<void>(resolve => { confirmed = resolve; });
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const response = await route.fetch(); confirmed(); await held; await route.fulfill({ response });
    });
    try {
      await root.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Delayed confirmed root reply");
      await thread.getByRole("button", { name: text.publish, exact: true }).click(); await written;
      await child.getByRole("button", { name: text.reply, exact: true }).click(); await body.fill("Keep this active draft");
      await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toBeDisabled();
      await child.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toBeFocused();
      release(); await expect(thread.getByText("Delayed confirmed root reply", { exact: true })).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(body).toHaveValue("Keep this active draft"); await expect(body).toBeFocused();
      await root.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("");
      await child.getByRole("button", { name: text.reply, exact: true }).click(); await expect(body).toHaveValue("Keep this active draft");
    } finally { release(); }
  });

  for (const stage of ["headers", "body"] as const) for (const destination of ["profile", "locale", "refresh"] as const) {
    test(`${locale}: delayed notification ${stage} cannot override ${destination}`, async ({ context, browser, page }) => {
      const { id, postId, commentId } = await setup(context, locale), member = await browser.newContext({ baseURL: origin });
      try {
        await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
        const { id: replyId } = await post(member, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Notification target", replyToId: commentId });
        const inbox = await (await context.request.get("/api/notifications")).json() as { items: { id: string; read: boolean }[] };
        const notificationId = inbox.items[0].id, path = `/api/notifications/${notificationId}/open`;
        await delayResponse(page, path, stage);
        // Removing a synthetic query through the inbox link requests a new
        // server snapshot at the same pathname, rather than reusing the route.
        await page.goto(`/${locale}/notifications${destination === "refresh" ? "?snapshot=before-read" : ""}`);
        await page.locator(`#notification-${notificationId}`).getByRole("button", { name: notificationText[locale].open, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-notification-waiting", "true");
        expect((await (await context.request.get("/api/notifications")).json()).items[0].read).toBe(true);
        const nextLocale = destination === "locale" ? locale === "en" ? "ar" : "en" : locale;
        const nextPath = `/${nextLocale}/${destination === "profile" ? "profile" : "notifications"}`;
        const navigation = destination === "locale" ? page.locator(`header a[hreflang='${nextLocale}']`) : page.locator(`.primary-navigation a[href='${nextPath}']`);
        await navigation.click(); await expect(page).toHaveURL(`${origin}${nextPath}`);
        const focus = destination === "profile" ? page.locator("#display-name") : page.locator(`header a[hreflang='${nextLocale}']`);
        if (destination !== "profile") {
          await expect(page.getByText(`${notificationText[nextLocale].unread}: ${(0).toLocaleString(nextLocale)}`, { exact: true })).toBeVisible();
          await expect(page.locator(`#notification-${notificationId}`).getByRole("button", { name: notificationText[nextLocale].open, exact: true })).toBeEnabled();
        }
        await focus.focus(); await releaseResponse(page);
        await expect(page).toHaveURL(`${origin}${nextPath}`); await expect(focus).toBeFocused();
        await expect(page.getByRole("main").getByRole("status").filter({ hasText: notificationText[locale].failed })).toHaveCount(0);
        // Ignoring stale client work must retain the server read. A current
        // retry still opens the authorized destination and gives it focus.
        if (destination === "profile") await page.locator(`.primary-navigation a[href='/${nextLocale}/notifications']`).click();
        const card = page.locator(`#notification-${notificationId}`); await expect(card).toContainText(notificationText[nextLocale].read);
        await card.getByRole("button", { name: notificationText[nextLocale].open, exact: true }).click();
        await expect(page).toHaveURL(`${origin}/${nextLocale}/communities/${id}/posts/${postId}?notification=${notificationId}`);
        await expect(page.locator(`#comment-${replyId}`)).toBeFocused();
      } finally { await member.close(); }
    });
  }

  test(`${locale}: vote failure feedback reflows and keyboard retry preserves the choice`, async ({ context, browser }) => {
    const { id, postId, commentId } = await setup(context, locale), voter = await browser.newContext({ baseURL: origin });
    const { id: replyId } = await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Narrow reply vote target", replyToId: commentId });
    const text = voteText[locale];
    try {
      await signIn(voter, locale); await post(voter, `/api/communities/${id}/memberships`, { action: "join" }, 200);
      const page = await voter.newPage(); await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await page.getByRole("button", { name: replyText[locale].show, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      for (const [targetId, suffix, choice] of [[`post-${postId}`, "", 1], [`comment-${commentId}`, `/comments/${commentId}`, -1], [`comment-${replyId}`, `/comments/${replyId}`, 1]] as const) {
        const target = page.locator(`#${targetId}`), group = target.getByRole("group", { name: text.group });
        const action = group.getByRole("button", { name: choice === 1 ? text.add : text.down, exact: true });
        const endpoint = `/api/communities/${id}/posts/${postId}${suffix}/vote`;
        const attempts: unknown[] = [];
        // Only the first transport response fails. Retry reaches the real route
        // with the same choice, preserving normal authorization and persistence.
        await page.route(`**${endpoint}`, route => {
          attempts.push(route.request().postDataJSON());
          return attempts.length === 1 ? route.fulfill({ status: 503, json: {} }) : route.continue();
        });
        await action.click(); await expect(group.locator("[aria-live]")).toHaveText(text.failed);
        await expect(action).toHaveAttribute("aria-pressed", "false");
        await expect(group.locator(".vote-up-count")).toHaveText(`${text.upvotes}: ${(0).toLocaleString(locale)}`);
        await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(0).toLocaleString(locale)}`);
        const retry = group.getByRole("button", { name: text.retry, exact: true });
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await expect(retry).toBeVisible();
          expect(await group.evaluate(element => {
            const card = element.closest("article")!.getBoundingClientRect(), control = element.getBoundingClientRect();
            const feedback = element.querySelector("[aria-live]")!.getBoundingClientRect();
            const children = [...element.querySelectorAll("button, [aria-live]")].map(child => child.getBoundingClientRect());
            return document.documentElement.scrollWidth <= innerWidth && control.left >= card.left && control.right <= card.right &&
              feedback.left >= control.left && feedback.right <= control.right && children.every(box => box.left >= control.left && box.right <= control.right);
          })).toBe(true);
        }
        await page.setViewportSize({ width: 320, height: 900 });
        await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press("Enter");
        await expect(group.locator("[aria-live]")).toHaveText(choice === 1 ? text.saved : text.downSaved);
        await expect(action).toHaveAttribute("aria-pressed", "true");
        expect(attempts).toEqual([{ value: choice }, { value: choice }]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    } finally { await voter.close(); }
  });

  test(`${locale}: independent vote totals, filled arrows and compact aligned composers`, async ({ context, browser }) => {
    const { id, postId, commentId } = await setup(context, locale), voter = await browser.newContext({ baseURL: origin }), opposite = await browser.newContext({ baseURL: origin });
    const { id: replyId } = await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Compact reply target", replyToId: commentId });
    const text = voteText[locale], replies = replyText[locale], comments = commentText[locale];
    try {
      for (const [member, value] of [[voter, 1], [opposite, -1]] as const) {
        await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
        for (const suffix of ["", `/comments/${commentId}`, `/comments/${replyId}`]) {
          const response = await member.request.put(`/api/communities/${id}/posts/${postId}${suffix}/vote`, { data: { value }, headers: { Origin: origin } });
          expect(response.status()).toBe(200);
        }
      }
      const page = await voter.newPage(); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await page.getByRole("button", { name: replies.show, exact: true }).click();
      const postCard = page.locator(`#post-${postId}`), root = page.locator(`#comment-${commentId}`);
      await root.getByRole("button", { name: replies.reply, exact: true }).focus(); await page.keyboard.press("Enter");
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const target of [postCard, root, page.locator(`#comment-${replyId}`)]) {
          const group = target.getByRole("group", { name: text.group });
          const up = group.getByRole("button", { name: text.add, exact: true }), down = group.getByRole("button", { name: text.down, exact: true });
          await expect(group.locator(".vote-up-count")).toHaveText(`${text.upvotes}: ${(1).toLocaleString(locale)}`);
          await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(1).toLocaleString(locale)}`);
          await expect(up.locator("svg")).toHaveAttribute("fill", "currentColor"); await expect(down.locator("svg")).toHaveAttribute("fill", "none");
          await expect(up).toHaveAccessibleDescription(`${text.upvotes}: ${(1).toLocaleString(locale)}`);
          await expect(down).toHaveAccessibleDescription(`${text.downvotes}: ${(1).toLocaleString(locale)}`);
        }
        const upBox = await postCard.getByRole("button", { name: text.add, exact: true }).boundingBox(), downBox = await postCard.getByRole("button", { name: text.down, exact: true }).boundingBox();
        const link = postCard.getByRole("link", { name: comments.title, exact: true }), linkBox = await link.boundingBox();
        expect(await link.innerText()).toBe(""); expect(linkBox!.width).toBe(36); expect(linkBox!.height).toBe(36);
        for (const box of [upBox!, downBox!]) expect(Math.abs(box.y + box.height / 2 - linkBox!.y - linkBox!.height / 2)).toBeLessThan(1);
        for (const name of [comments.body, replies.body]) {
          const body = page.getByRole("textbox", { name, exact: true }), composer = body.locator("../..");
          await expect(body).toHaveAttribute("rows", "2"); const field = await body.boundingBox(), actions = await composer.locator(".composer-actions").boundingBox();
          expect(field!.height).toBeGreaterThanOrEqual(68); expect(field!.height).toBeLessThan(82);
          expect(Math.abs(field!.x - actions!.x)).toBeLessThan(1); expect(Math.abs(field!.width - actions!.width)).toBeLessThan(1);
          expect((await composer.boundingBox())!.height).toBeLessThan(220);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const group = postCard.getByRole("group", { name: text.group }), down = group.getByRole("button", { name: text.down, exact: true });
      await down.click(); await expect(group.locator(".vote-up-count")).toHaveText(`${text.upvotes}: ${(0).toLocaleString(locale)}`);
      await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(2).toLocaleString(locale)}`); await expect(down.locator("svg")).toHaveAttribute("fill", "currentColor");
      await down.click(); await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(1).toLocaleString(locale)}`);
      await page.reload(); await expect(group.locator(".vote-up-count")).toHaveText(`${text.upvotes}: ${(0).toLocaleString(locale)}`);
      await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(1).toLocaleString(locale)}`);
    } finally { await voter.close(); await opposite.close(); }
  });

  test(`${locale}: comments entry point opens a usable eligible composer`, async ({ context, page }) => {
    const { id, postId } = await setup(context, locale); await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`/${locale}/communities/${id}`);
    const card = page.locator(`#post-${postId}`), link = card.getByRole("link", { name: commentText[locale].title, exact: true });
    await expect(link).toBeVisible(); await link.click(); await expect(page.locator("#comments-heading")).toBeFocused();
    await expect(page.getByRole("textbox", { name: commentText[locale].body, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: replyText[locale].reply, exact: true })).toBeVisible();
  });
  test(`${locale}: zero-reply roots have no misleading show action`, async ({ context, page }) => {
    const { id, postId } = await setup(context, locale); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    await expect(page.getByRole("button", { name: replyText[locale].reply, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: replyText[locale].show, exact: true })).toHaveCount(0);
  });
  test(`${locale}: blocked commenting gives actionable join and profile steps`, async ({ context, browser }) => {
    const { id, postId } = await setup(context, locale), member = await browser.newContext({ baseURL: origin }), text = commentText[locale];
    try {
      await signIn(member, locale, false); const page = await member.newPage(); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await expect(page.getByText(text.joinRequired, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: text.openCommunity, exact: true })).toHaveAttribute("href", `/${locale}/communities/${id}`);
      await expect(page.getByRole("textbox", { name: text.body, exact: true })).toHaveCount(0);
      await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200); await page.reload();
      await expect(page.getByText(text.profileRequired, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: text.saveProfile, exact: true })).toHaveAttribute("href", `/${locale}/profile`);
      await post(member, "/api/identity/profile", { displayName: "Ready to comment" }, 200); await page.reload();
      await expect(page.getByRole("textbox", { name: text.body, exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: replyText[locale].reply, exact: true })).toBeVisible();
    } finally { await member.close(); }
  });
  test(`${locale}: compact signed controls and first-upvote inbox links work for every target`, async ({ context, browser }) => {
    const { id, postId, commentId } = await setup(context, locale), member = await browser.newContext({ baseURL: origin });
    const { id: replyId } = await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "Owned reply", replyToId: commentId });
    const text = voteText[locale], notifications = notificationText[locale];
    try {
      await signIn(member, locale); await post(member, `/api/communities/${id}/memberships`, { action: "join" }, 200);
      const page = await member.newPage(); await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await page.getByRole("button", { name: replyText[locale].show, exact: true }).click();
      for (const target of [`post-${postId}`, `comment-${commentId}`, `comment-${replyId}`]) {
        const group = page.locator(`#${target}`).getByRole("group", { name: text.group });
        const up = group.getByRole("button", { name: text.add, exact: true }), down = group.getByRole("button", { name: text.down, exact: true });
        for (const [button, value] of [[down, -1], [up, 1], [down, -1], [down, 0], [up, 1], [up, 0]] as const) {
          await button.focus(); await page.keyboard.press("Enter");
          await expect(group.locator(".vote-up-count")).toHaveText(`${text.upvotes}: ${(value === 1 ? 1 : 0).toLocaleString(locale)}`);
          await expect(group.locator(".vote-down-count")).toHaveText(`${text.downvotes}: ${(value === -1 ? 1 : 0).toLocaleString(locale)}`);
          await expect(up).toHaveAttribute("aria-pressed", String(value === 1)); await expect(down).toHaveAttribute("aria-pressed", String(value === -1));
        }
        for (const button of [up, down]) { const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(36); expect(box!.height).toBe(36); }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const response = await context.request.get("/api/notifications"), inbox = await response.json() as { items: { id: string; kind: string }[] };
      const votes = inbox.items.filter(item => item.kind === "UPVOTE"); expect(votes).toHaveLength(3);
      const ownerPage = await context.newPage(); await ownerPage.setViewportSize({ width: 1280, height: 900 }); await ownerPage.goto(`/${locale}/notifications`);
      await expect(ownerPage.getByText(new RegExp(notifications.upvote))).toHaveCount(3);
      const replyNotification = await fixture(async client => (await client.query<{ id: string }>('SELECT id FROM "Notification" WHERE "commentId"=$1 AND kind=\'UPVOTE\'', [replyId])).rows[0].id);
      await ownerPage.locator(`#notification-${replyNotification}`).getByRole("button", { name: notifications.open, exact: true }).click();
      await expect(ownerPage.locator(`#comment-${replyId}`)).toBeFocused();
      expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await member.close(); }
  });
}
