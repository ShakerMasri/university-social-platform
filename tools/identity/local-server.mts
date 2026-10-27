import { resolve } from "node:path";
import { readManifest } from "../database/targets.ts";
import { startLocalIdentityServer } from "./server.mts";
const name = process.env.M2_BROWSER_DATABASE, manifest = readManifest();
if (process.env.M2_IDENTITY_E2E !== "1" || !manifest.databases.some(record => record.name === name && record.kind === "test" && record.ready)) throw new Error("An explicitly owned disposable identity browser database is required");
await startLocalIdentityServer(manifest, name!, "test", 3100, resolve(".cache/m2-browser.json"));
