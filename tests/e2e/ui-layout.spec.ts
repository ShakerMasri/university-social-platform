import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { communityText } from "../../src/i18n/communities";
import { interfaceText } from "../../src/i18n/interface";
import { replyText } from "../../src/i18n/replies";
import { dictionaries } from "../../src/i18n/dictionaries";
import { identityText } from "../../src/i18n/identity";

test.use({ trace: "off", screenshot: "off", video: "off" });

test.beforeEach(async () => {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable UI browser target required");
  const url = databaseUrl(manifest, name!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'');
  } catch { throw new Error("Synthetic UI fixture failed; sensitive diagnostics omitted"); }
  finally { await client.end(); }
});

async function expectReflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Inputs must also fit their container; document width alone misses clipping.
  expect(await page.locator("main input, main textarea, main select, main button").evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth + 1;
  }))).toBe(true);
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: sign-in email suffix keeps its visual character order`, async ({ page }) => {
    for (const width of [320, 360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/signin`);
      const hint = page.locator("#email-hint");
      await expect(hint).toHaveText(identityText[locale].hint);
      const suffix = hint.locator("bdi");
      await expect(suffix).toHaveText("@university.test");
      const positions = await suffix.evaluate(element => {
        const text = element.firstChild!;
        const character = (index: number) => {
          const range = document.createRange();
          range.setStart(text, index); range.setEnd(text, index + 1);
          const box = range.getBoundingClientRect();
          return { left: box.left, top: box.top };
        };
        return { at: character(0), firstLetter: character(1) };
      });
      expect(positions.at.left).toBeLessThan(positions.firstLetter.left);
      expect(positions.at.top).toBeCloseTo(positions.firstLetter.top, 0);
      await expectReflow(page);
    }
  });

  test(`${locale}: discovery and discussion reflow, keyboard landmarks and language context`, async ({ context, page }) => {
    const create = async (path: string, data: object, status = 201) => {
      const response = await context.request.post(path, { data, headers: { Origin: "http://127.0.0.1:3100" } });
      expect(response.status()).toBe(status);
      return response.json() as Promise<{ id: string }>;
    };
    const email = `ui.${randomUUID()}@university.test`;
    await create("/api/identity/request", { email, locale }, 202);
    const token = await syntheticTokenFor(email);
    await create("/api/identity/confirm", { token, locale }, 200);
    await create("/api/identity/profile", { displayName: "طالب Learning partner" }, 200);
    const name = "هندسة الحاسوب · Computer engineering — a shared space across academic years";
    const { id } = await create("/api/communities", { name, description: "نناقش الأفكار ونشارك المعرفة. A place for thoughtful academic conversations.", visibility: "PUBLIC" });
    const { id: postId } = await create(`/api/communities/${id}/posts`, { requestId: randomUUID(), type: "RESOURCE", title: "كيف نفهم التزامن؟ Understanding concurrency together", body: "ملاحظات للنقاش · Notes for discussion\n" + "LongIdentifier".repeat(15), resourceUrl: "https://example.com/" + "reference".repeat(25) });
    const { id: commentId } = await create(`/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "هل يمكن توضيح المثال؟ Could we walk through the example?" });
    await create(`/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "نعم، نبدأ بحالة بسيطة. Let's start with a small example.", replyToId: commentId });

    // Earlier suites deliberately populate hundreds of communities. Follow the
    // real cursor contract instead of assuming this fixture is on the first page.
    let after: string | null = null;
    for (let attempt = 0; attempt < 64; attempt++) {
      const response = await context.request.get(`/api/communities${after ? `?after=${after}` : ""}`);
      expect(response.status()).toBe(200);
      const listing = await response.json() as { items: { id: string }[]; next: string | null };
      if (listing.items.some(item => item.id === id)) break;
      expect(listing.next).not.toBeNull();
      after = listing.next;
      if (attempt === 63) throw new Error("Synthetic community not found within bounded discovery pages");
    }
    const directory = `/${locale}/communities${after ? `?after=${after}` : ""}`;
    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(directory);
      await expect(page.getByRole("heading", { name: name, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: interfaceText[locale].navigation }).getByRole("link", { name: communityText[locale].title, exact: true })).toHaveAttribute("aria-current", "page");
      await expectReflow(page);
      const createLink = page.getByRole("link", { name: communityText[locale].create, exact: true });
      await createLink.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#create-heading")).toBeFocused();
      await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
      await page.getByRole("button", { name: replyText[locale].show, exact: true }).click();
      await expect(page.getByText("نعم، نبدأ بحالة بسيطة. Let's start with a small example.", { exact: true })).toBeVisible();
      await expectReflow(page);
    }

    // Exercise text resize and spacing together on the narrowest layout.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addStyleTag({ content: "html { font-size: 200%; } body { line-height: 1.5; } p { margin-block-end: 2em; } * { letter-spacing: 0.12em; word-spacing: 0.16em; }" });
    await expectReflow(page);
    // A fresh document avoids Chromium restoring the previous scroll/focus
    // starting point when reloading the same discussion after resize checks.
    await page.goto("about:blank");
    await page.goto(`/${locale}/communities/${id}/posts/${postId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: dictionaries[locale].skipToContent })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("button", { name: replyText[locale].reply, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel(replyText[locale].body, { exact: true })).toBeFocused();
    await page.getByRole("button", { name: replyText[locale].cancel, exact: true }).click();
    await expect(page.locator(`#comment-${commentId}`)).toBeFocused();
    const other = locale === "en" ? "ar" : "en";
    await page.getByRole("link", { name: other === "ar" ? "العربية" : "English", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${other}/communities/${id}/posts/${postId}$`));
    await expect(page.locator("html")).toHaveAttribute("dir", other === "ar" ? "rtl" : "ltr");
  });
}
