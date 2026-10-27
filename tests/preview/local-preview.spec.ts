import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { localPreviewPort } from "../../src/server/identity/local-policy";
import { identityText } from "../../src/i18n/identity";
import { communityText } from "../../src/i18n/communities";
import { postText } from "../../src/i18n/posts";
import { verifyDevelopmentLifecycle } from "./development-lifecycle";

test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = `http://localhost:${localPreviewPort(process.env.USP_LOCAL_PREVIEW_PORT ?? "3201")}`;
const address = () => `preview.${randomUUID()}@university.test`;
async function requestLink(page: Page, email: string, locale: "en" | "ar") {
  await page.goto(`${origin}/${locale}/signin`);
  await page.getByLabel(identityText[locale].email, { exact: true }).fill(email);
  await page.getByRole("button", { name: identityText[locale].request, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(identityText[locale].requested);
}
async function confirm(page: Page, context: BrowserContext, locale: "en" | "ar") {
  await page.getByRole("button", { name: identityText[locale].previewOpen, exact: true }).click();
  await expect(page.getByRole("button", { name: identityText[locale].confirm, exact: true })).toBeVisible();
  // The server-rendered button can precede hydration in development. Require
  // the same cleared-fragment invariant after the client capture effect runs.
  await expect.poll(() => page.evaluate(() => location.hash === "")).toBe(true);
  expect((await context.request.get(`${origin}/api/identity/profile`)).status()).toBe(401);
  await page.getByRole("button", { name: identityText[locale].confirm, exact: true }).click();
  await expect(page.getByLabel(identityText[locale].name, { exact: true })).toBeVisible();
}
for (const locale of ["en", "ar"] as const) {
  test(`${locale}: localhost browser sign-in, confirmation, profile, community and post work without Inspector`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    try {
      const page = await context.newPage(), email = address(), name = `${locale === "ar" ? "طالب" : "Preview"} ${randomUUID()}`;
      const title = locale === "ar" ? "منشور تجريبي محلي" : "Local preview post";
      await requestLink(page, email, locale); await confirm(page, context, locale);
      await page.getByLabel(identityText[locale].name, { exact: true }).fill(name);
      await page.getByRole("button", { name: identityText[locale].save, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(identityText[locale].saved);
      await page.reload(); expect(await page.getByLabel(identityText[locale].name, { exact: true }).inputValue() === name).toBe(true);
      await page.getByRole("link", { name: communityText[locale].title, exact: true }).click();
      await page.getByLabel(communityText[locale].name, { exact: true }).fill("Local preview community");
      await page.getByLabel(communityText[locale].visibility, { exact: true }).selectOption("PUBLIC");
      await page.getByRole("button", { name: communityText[locale].create, exact: true }).click();
      await page.getByLabel(postText[locale].postTitle, { exact: true }).fill(title);
      await page.getByLabel(postText[locale].body, { exact: true }).fill(locale === "ar" ? "محتوى تجريبي للتطوير" : "Synthetic preview content");
      await page.getByRole("button", { name: postText[locale].publish, exact: true }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await page.reload(); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    } finally { await context.close(); }
  });
}
test("preview adversarial: mailbox retrieval requires requesting browser, exact Host/Origin and a live pending challenge", async ({ browser }) => {
  const a = await browser.newContext({ baseURL: origin }), b = await browser.newContext({ baseURL: origin });
  try {
    const page = await a.newPage(), email = address(); await requestLink(page, email, "en");
    const path = `${origin}/__local-preview/confirmation`;
    const retrieve = (context: BrowserContext, data: object, headers: Record<string, string> = {}) => context.request.post(path, { data, headers: { Origin: origin, ...headers } });
    expect((await b.request.get(path)).status()).toBe(405);
    expect((await retrieve(b, { email })).status()).toBe(400);
    const bPage = await b.newPage(); await requestLink(bPage, address(), "en");
    expect((await retrieve(b, { email })).status()).toBe(400);
    for (const Origin of ["", "https://attacker.invalid"]) expect((await retrieve(a, { email }, { Origin })).status()).toBe(403);
    expect((await retrieve(a, { email }, { Host: "attacker.invalid" })).status()).toBe(403);
    expect((await retrieve(a, { email, role: "admin" })).status()).toBe(400);
    expect((await retrieve(a, { email: "x".repeat(3000) })).status()).toBe(400);
    expect((await retrieve(a, { email: "real@stu.najah.edu" })).status()).toBe(400);
    const response = await retrieve(a, { email }); expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const message = await response.json() as { token?: unknown }; expect(typeof message.token === "string").toBe(true);
    await confirm(page, a, "en");
    expect((await retrieve(a, { email })).status()).toBe(400);
    // Active preview metadata prevents cleanup of a database in current use.
    const cleanup = spawnSync(process.execPath, ["tools/database/local.mts", "cleanup"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    expect(cleanup.status).toBe(1);
    expect((cleanup.stderr ?? "").includes("Stop the owned local preview")).toBe(true);
  } finally { await a.close(); await b.close(); }
});

// Last: this check deliberately replaces Playwright's original server process.
if (process.env.USP_LOCAL_DEVELOPMENT_CHECK === "1") {
  test("development: English and Arabic controls wait for hydration", async ({ browser }) => {
    for (const locale of ["en", "ar"] as const) {
      const context = await browser.newContext({ baseURL: origin });
      const gate = Promise.withResolvers<void>();
      try {
        await context.route("**/_next/**", async route => {
          if (route.request().resourceType() === "script") await gate.promise;
          await route.continue();
        });
        const page = await context.newPage();
        await page.goto(`/${locale}/signin`, { waitUntil: "commit" });
        await expect(page.getByLabel(identityText[locale].email, { exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: identityText[locale].request, exact: true })).toBeDisabled();
        gate.resolve();
        await expect(page.getByLabel(identityText[locale].email, { exact: true })).toBeEnabled();
        await expect(page.getByRole("button", { name: identityText[locale].request, exact: true })).toBeEnabled();
      } finally { gate.resolve(); await context.close(); }
    }
  });
  test("development: hot reload and restart preserve the session, profile and post", async ({ page, context }) => {
    await requestLink(page, address(), "en"); await confirm(page, context, "en");
    await page.getByLabel(identityText.en.name, { exact: true }).fill("Development restart user");
    await page.getByRole("button", { name: identityText.en.save, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(identityText.en.saved);
    await page.getByRole("link", { name: communityText.en.title, exact: true }).click();
    await page.getByLabel(communityText.en.name, { exact: true }).fill("Development restart community");
    await page.getByRole("button", { name: communityText.en.create, exact: true }).click();
    await page.getByLabel(postText.en.postTitle, { exact: true }).fill("Development restart post");
    await page.getByLabel(postText.en.body, { exact: true }).fill("Synthetic restart content");
    await page.getByRole("button", { name: postText.en.publish, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Development restart post", exact: true })).toBeVisible();
    await verifyDevelopmentLifecycle(page, context);
  });
}
