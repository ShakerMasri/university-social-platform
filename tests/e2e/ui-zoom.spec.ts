import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { syntheticTokenFor } from "./synthetic-mail";
import { readManifest, databaseUrl, assertDatabaseIdentity } from "../../tools/database/targets";
import { communityText } from "../../src/i18n/communities";
import { identityText } from "../../src/i18n/identity";
import { archiveText } from "../../src/i18n/archive";
import { peopleText } from "../../src/i18n/people";

test.use({ trace: "off", screenshot: "off", video: "off" });
const origin = "http://127.0.0.1:3100";

test.beforeEach(async () => {
  const manifest = readManifest(), name = process.env.M2_BROWSER_DATABASE;
  if (!manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("Owned disposable zoom browser target required");
  const url = databaseUrl(manifest, name!, "migration");
  await assertDatabaseIdentity(url, manifest, "migration");
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('UPDATE "IdentityRateLimit" SET "startedAt"=now()-interval \'16 minutes\'');
  } catch { throw new Error("Synthetic zoom fixture failed; sensitive diagnostics omitted"); }
  finally { await client.end(); }
});

type ZoomApi = {
  tabs: {
    query(options: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>;
    setZoomSettings(id: number, settings: { mode: "automatic"; scope: "per-origin" }): Promise<void>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
};

async function setBrowserZoom(worker: Worker, factor: number) {
  const actual = await worker.evaluate(async factor => {
    const api = (globalThis as unknown as { chrome: ZoomApi }).chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error("Active test tab required");
    // Per-tab zoom resets on navigation. This isolated profile contains only
    // synthetic test pages, so per-origin zoom can safely follow route changes.
    await api.tabs.setZoomSettings(tab.id, { mode: "automatic", scope: "per-origin" });
    await api.tabs.setZoom(tab.id, factor);
    return api.tabs.getZoom(tab.id);
  }, factor);
  expect(actual).toBeCloseTo(factor, 6);
}

async function post(context: BrowserContext, path: string, data: object, status = 201) {
  const response = await context.request.post(path, { data, headers: { Origin: origin } });
  expect(response.status()).toBe(status);
  return response.json() as Promise<{ id: string }>;
}

async function expectPageFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overflow = await page.locator("main input, main textarea, main select, main button, .button-link").evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.left < -1 || box.right > innerWidth + 1;
  }).map(element => ({ tag: element.tagName, id: element.id })));
  expect(overflow).toEqual([]);
}

async function expectZoomMeasurement(page: Page, baseline: { width: number; dpr: number; font: string }, factor: number) {
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeCloseTo(baseline.width / factor, 0);
  const measurement = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, font: getComputedStyle(document.documentElement).fontSize, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport?.scale }));
  expect(measurement.dpr).toBeCloseTo(baseline.dpr * factor, 6);
  expect(measurement.font).toBe(baseline.font);
  expect(measurement.cssZoom).toBe("1");
  expect(measurement.visualScale).toBe(1);
  return measurement;
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: real 200% and 400% browser zoom retains reflow and form navigation`, async () => {
    test.setTimeout(60_000);
    const extension = resolve("tests/e2e/fixtures/page-zoom");
    // A disposable persistent profile is required for Chromium's native zoom API.
    // No personal profile, emulated viewport, CSS zoom or device-scale override.
    const context = await chromium.launchPersistentContext("", {
      // Explicit undefined prevents the runner's Desktop Chrome scale-factor
      // emulation from being injected into this native-window context.
      channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, baseURL: origin,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1296,900"],
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const page = context.pages()[0] ?? await context.newPage();
      const email = `zoom.${randomUUID()}@university.test`;
      await post(context, "/api/identity/request", { email, locale }, 202);
      const token = await syntheticTokenFor(email);
      await post(context, "/api/identity/confirm", { token, locale }, 200);
      await post(context, "/api/identity/profile", { displayName: "طالب Zoom participant" }, 200);
      expect((await context.request.put("/api/people/profile", { data: { displayName: `Zoom ${email.slice(5, 13)}`, directoryVisible: true }, headers: { Origin: origin } })).status()).toBe(200);
      const directory = await context.request.get(`/api/people?q=${email.slice(5, 13)}`);
      expect(directory.status()).toBe(200);
      const directoryId = (await directory.json()).items[0].id as string;
      const { id } = await post(context, "/api/communities", { name: "Zoom مجتمع دراسة", description: "Academic learning · تعلم مشترك", visibility: "PUBLIC" });
      const { id: postId } = await post(context, `/api/communities/${id}/posts`, { requestId: randomUUID(), type: "RESOURCE", title: "التزامن Concurrency discussion", body: "MixedIdentifier".repeat(30), resourceUrl: "https://example.com/" + "reference".repeat(20) });
      await post(context, `/api/communities/${id}/posts/${postId}/comments`, { requestId: randomUUID(), body: "تعليق طويل · A thoughtful bilingual comment" });
      await page.goto(`/${locale}/profile`);
      const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, font: getComputedStyle(document.documentElement).fontSize }));
      expect(baseline.width).toBeGreaterThanOrEqual(1280);
      for (const factor of [2, 4]) {
        await setBrowserZoom(worker, factor);
        const measurement = await expectZoomMeasurement(page, baseline, factor);
        console.log(`${locale} native zoom ${factor * 100}%: ${JSON.stringify(measurement)}`);
        for (const path of ["", "signin", "verify", "profile", "communities", `communities/${id}`, `communities/${id}/posts/${postId}`, "notifications", "archive", "people", `people/${directoryId}`]) {
          await page.goto(`/${locale}/${path}`);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expectZoomMeasurement(page, baseline, factor);
          await expectPageFits(page);
        }
        await page.goto(`/${locale}/communities`);
        await expectZoomMeasurement(page, baseline, factor);
        await expect(page.locator("#community-name")).toBeEnabled();
        await page.getByRole("link", { name: communityText[locale].create, exact: true }).click();
        await expect(page.locator("#create-heading")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator("#community-name")).toBeFocused();
        const focus = await page.locator("#community-name").evaluate(element => {
          const box = element.getBoundingClientRect(), style = getComputedStyle(element);
          return { top: box.top, bottom: box.bottom, outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
        });
        expect(focus.top).toBeGreaterThanOrEqual(0);
        expect(focus.bottom).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
        expect(focus.outline).toBe("solid");
        expect(focus.outlineWidth).toBeGreaterThanOrEqual(3);
        await page.goto(`/${locale}/profile`);
        await expectZoomMeasurement(page, baseline, factor);
        await page.getByLabel(identityText[locale].name, { exact: true }).fill("طالب Zoom saved");
        await page.getByRole("button", { name: identityText[locale].save, exact: true }).click();
        await expect(page.locator("#identity-feedback")).toHaveText(identityText[locale].saved);
        await expectZoomMeasurement(page, baseline, factor);
        await expectPageFits(page);
        await page.goto(`/${locale}/archive?community=${id}`);
        await page.getByLabel(archiveText[locale].query, { exact: true }).fill("Concurrency");
        await page.getByRole("button", { name: archiveText[locale].submit, exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(page.locator(".archive-result")).toHaveCount(1);
        await expect(page.getByRole("heading", { name: archiveText[locale].results, exact: true })).toBeFocused();
        await expectPageFits(page);
        await page.goto(`/${locale}/people`);
        await page.getByLabel(peopleText[locale].query, { exact: true }).fill("Zoom saved");
        await page.getByRole("button", { name: peopleText[locale].submit, exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(page.locator(".people-result").first()).toBeVisible();
        await expect(page.getByRole("heading", { name: peopleText[locale].results, exact: true })).toBeFocused();
        await expectZoomMeasurement(page, baseline, factor); await expectPageFits(page);
      }
    } finally { await context.close(); }
  });
}
