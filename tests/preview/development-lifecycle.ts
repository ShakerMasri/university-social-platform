import { expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";

// Explicit development check only: all browser credentials stay in RAM, and
// server output/artifacts are disabled. The runner owns a disposable database.
export async function verifyDevelopmentLifecycle(page: Page, context: BrowserContext) {
  const rejectedHeaders: Record<string, string>[] = [{ Origin: "https://attacker.invalid" }, { Origin: new URL(page.url()).origin, Host: "attacker.invalid" }];
  for (const headers of rejectedHeaders) {
    const response = await context.request.get("/_next/webpack-hmr", { headers: {
      Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": randomBytes(16).toString("base64"), ...headers,
    } });
    expect(response.status()).toBe(403);
  }
  const source = resolve("src/app/[locale]/identity-shell.tsx");
  const original = readFileSync(source, "utf8");
  const modified = original.replace("<footer>", '<footer data-development-refresh="verified">');
  expect(modified !== original).toBe(true);
  let documents = 0;
  let sourceChanged = false;
  const count = (request: import("@playwright/test").Request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; };
  page.on("request", count);
  try {
    // Wait for application assets before changing the module. The page must
    // update without an explicit navigation/reload by the test.
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("/_next/")))).toBe(true);
    writeFileSync(source, modified);
    sourceChanged = true;
    await expect(page.locator('footer[data-development-refresh="verified"]')).toBeVisible({ timeout: 30000 });
  } finally {
    page.off("request", count);
    if (sourceChanged) {
      expect(readFileSync(source, "utf8") === modified, "Development check source changed concurrently; inspect before restoring").toBe(true);
      writeFileSync(source, original);
    }
  }
  await expect(page.locator("footer")).not.toHaveAttribute("data-development-refresh", "verified", { timeout: 30000 });
  // Server Components may trigger a full refresh. Bound it to rule out a loop.
  expect(documents <= 2).toBe(true);
  const before = page.url();
  const profileBefore = await context.request.get("/api/identity/profile");
  expect(profileBefore.status()).toBe(200);

  const controlPath = resolve(".cache/m2-preview-check.json");
  async function stop() {
    const control = JSON.parse(readFileSync(controlPath, "utf8")) as { port: number; key: string; databaseName: string };
    // Never stop a manual/development database or a different runner.
    if (control.databaseName !== process.env.USP_PREVIEW_TEST_DATABASE) throw new Error("Development check control mismatch");
    await new Promise<void>((accept, reject) => {
      const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, operation: "stop" }) + "\n"));
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Development check shutdown timed out")); });
      let output = "";
      socket.on("data", chunk => { output += chunk.toString(); if (output.length > 2048) socket.destroy(new Error("Invalid development control response")); });
      socket.on("error", () => reject(new Error("Development check control unavailable")));
      socket.on("end", () => {
        try { const reply = JSON.parse(output); if (reply.stopped !== true || reply.databaseName !== control.databaseName) throw new Error(); accept(); }
        catch { reject(new Error("Development check shutdown not confirmed")); }
      });
    });
    await expect.poll(() => existsSync(controlPath), { timeout: 15000 }).toBe(false);
  }
  let replacement: ChildProcess | undefined;
  await page.close(); // Preserve cookies/context, close the old HMR reconnect loop.
  try {
    await stop();
    replacement = spawn(process.execPath, ["tools/identity/preview-server.mts", "check-dev"], { stdio: "ignore", windowsHide: true });
    replacement.on("error", () => { /* Readiness assertion reports failure without command/env details. */ });
    await expect.poll(() => existsSync(controlPath), { timeout: 30000 }).toBe(true);
    const reopened = await context.newPage();
    await reopened.goto(before);
    await expect(reopened.getByRole("heading", { name: "Development restart post", exact: true })).toBeVisible();
    const profileAfter = await context.request.get("/api/identity/profile");
    expect(profileAfter.status()).toBe(200);
    // Boolean assertions keep even synthetic profile/session response data out
    // of failure reports.
    expect(JSON.stringify(await profileAfter.json()) === JSON.stringify(await profileBefore.json())).toBe(true);
  } finally {
    try {
      if (replacement && existsSync(controlPath)) await stop();
    } finally {
      // This exact child belongs to this check; never kill a PID from an old file.
      if (replacement && replacement.exitCode === null) replacement.kill();
    }
  }
}
