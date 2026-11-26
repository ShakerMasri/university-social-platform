// Reports the initial client JavaScript each app route loads, from the last
// `next build` output. Used to hold the UI rebuild to its recorded baseline
// (plan acceptance criterion 10). Read-only: it never modifies the build.
//
// Per route: the shared root chunks every page loads, plus the chunks listed
// for that route's layouts and page in its client reference manifest. Sizes
// are raw and gzip (level 9) bytes. Development-only routes are excluded.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const buildDirectory = resolve(".next");
const appDirectory = join(buildDirectory, "server", "app");
const manifestSuffix = "page_client-reference-manifest.js";
const developmentOnlyRoute = /(^|\/)dev(\/|$)/;

type BuildManifest = { rootMainFiles: string[] };
type ClientReferenceManifest = { entryJSFiles?: Record<string, string[]> };

if (!existsSync(join(buildDirectory, "build-manifest.json"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const sizeCache = new Map<string, { raw: number; gzip: number }>();
function fileSize(file: string) {
  const cached = sizeCache.get(file);
  if (cached) return cached;
  const bytes = readFileSync(join(buildDirectory, file));
  const size = { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  sizeCache.set(file, size);
  return size;
}
function total(files: Iterable<string>) {
  let raw = 0, gzip = 0;
  for (const file of files) { const size = fileSize(file); raw += size.raw; gzip += size.gzip; }
  return { raw, gzip };
}
function findManifests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findManifests(path);
    return entry.name === manifestSuffix ? [path] : [];
  });
}
function parseClientManifest(path: string): ClientReferenceManifest {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("] = ");
  if (start < 0) throw new Error(`Unrecognized client reference manifest: ${path}`);
  return JSON.parse(source.slice(start + 4).trim().replace(/;$/, "")) as ClientReferenceManifest;
}
const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

const buildManifest = JSON.parse(readFileSync(join(buildDirectory, "build-manifest.json"), "utf8")) as BuildManifest;
const shared = new Set(buildManifest.rootMainFiles);
const sharedSize = total(shared);

const rows = findManifests(appDirectory).map((path) => {
  const route = "/" + relative(appDirectory, path).split(sep).slice(0, -1).join("/");
  const files = new Set(shared);
  for (const chunks of Object.values(parseClientManifest(path).entryJSFiles ?? {})) for (const chunk of chunks) files.add(chunk);
  return { route, ...total(files) };
}).filter((row) => !developmentOnlyRoute.test(row.route)).sort((a, b) => a.route.localeCompare(b.route));

console.log(`Shared root chunks: ${kib(sharedSize.raw)} raw, ${kib(sharedSize.gzip)} gzip`);
console.log("Route | raw | gzip");
for (const row of rows) console.log(`${row.route} | ${kib(row.raw)} | ${kib(row.gzip)}`);
const largest = rows.reduce((max, row) => (row.gzip > max.gzip ? row : max), rows[0]);
if (largest) console.log(`Largest route: ${largest.route} at ${kib(largest.gzip)} gzip`);
