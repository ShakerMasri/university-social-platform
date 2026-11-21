import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const branch = "feat/m4-feed";
const head = "4695eb613ce511f746d74d44df7f0dd56917f3e0";
const manifestName = "FEED-QA-SHA256.json";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

const pending = new Set([
  "README.md", "docs/project-brief.md", "docs/m4-f02-manual-qa.md", "package.json", "compose.m1b.yaml",
  "src/app/[locale]/feed/data.test.ts", "src/app/[locale]/feed/data.ts", "src/app/[locale]/feed/list.tsx",
  "src/app/[locale]/feed/page.tsx", "src/app/[locale]/feed/feed-page.tsx",
  "src/app/[locale]/feed/for-you/page.tsx", "src/app/[locale]/identity-shell.tsx",
  "src/app/[locale]/feed/check-session.ts", "src/app/[locale]/feed/check-session.test.ts",
  "src/app/[locale]/identity-forms.tsx", "src/app/[locale]/session-change.ts", "src/app/api/feed/session/route.ts",
  "src/app/api/feed/for-you/route.ts", "src/i18n/feed.ts", "src/server/feed/service.ts",
  "src/server/feed/for-you-policy.test.ts", "src/server/feed/for-you-policy.ts",
  "src/server/feed/for-you-service.ts", "src/server/feed/memberships.ts",
  "tests/database/feed.test.ts", "tests/e2e/feed-disabled.spec.ts", "tests/e2e/feed.spec.ts",
  "playwright.feed-component.config.ts", "tests/feed-component/fixture.tsx",
  "tests/feed-component/navigation.tsx", "tests/feed-component/revalidation.spec.ts",
  "tools/database/local.mts", "tools/database/compose.ts", "tools/database/compose.test.ts", "tools/database/targets.ts", "tools/database/targets.test.ts",
  "tools/testing/manual-session.mts", "tools/testing/feed-qa-windows.mts",
  "tools/testing/feed-qa-guest.mts", "tools/testing/feed-qa-fixture.mts",
  "tools/database/feed-qa.test.ts", "tools/testing/feed-qa-snapshot.mts",
]);

export function allowedFeedSnapshotPath(path: unknown): path is string {
  return typeof path === "string" && /^[a-zA-Z0-9_./[\]@-]+$/.test(path) &&
    path.split("/").every(part => part && part !== "." && part !== ".." &&
      !/^(\.env|\.git$|\.cache$|\.tools$|\.aws$|\.codex$|\.next$|\.ssh$|\.docker$|\.kube$|node_modules$)/i.test(part)) &&
    !/\.(?:pem|key|pfx|p12|db|sqlite3?|dump|bak|log)$/i.test(path);
}

function localFile(path: string) {
  const absolute = resolve(path);
  if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute) throw new Error("Snapshot requires ordinary local files");
  return readFileSync(absolute);
}

export function verifyFeedSnapshot(approvedDigest: unknown) {
  const raw = localFile(manifestName);
  if (typeof approvedDigest !== "string" || !/^[0-9a-f]{64}$/.test(approvedDigest) || sha256(raw) !== approvedDigest) {
    throw new Error("Feed QA snapshot hash differs from the owner-approved SHA-256");
  }
  const manifest = JSON.parse(raw.toString("utf8")) as { version: number; branch: string; head: string; files: { path: string; sha256: string }[] };
  if (manifest.version !== 1 || manifest.branch !== branch || manifest.head !== head ||
      !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("Feed QA source inventory is invalid");
  const files = new Set<string>();
  for (const entry of manifest.files) {
    if (!entry || !allowedFeedSnapshotPath(entry.path) || files.has(entry.path) || sha256(localFile(entry.path)) !== entry.sha256) {
      throw new Error("Feed QA source file is missing, changed or unsafe");
    }
    files.add(entry.path);
  }
  if ([...pending].some(path => !files.has(path))) throw new Error("Feed QA snapshot is missing reviewed changes");
  // A guest install/build generates these paths. Other unlisted source or
  // config could change the build and is refused, even if hashes still match.
  const generated = new Set([manifestName, ".cache", ".next", "node_modules", "next-env.d.ts", "tsconfig.tsbuildinfo",
    "test-results", "playwright-report", "src/generated"]);
  function verifyTree(base = "") {
    for (const name of readdirSync(base || ".")) {
      const path = base ? `${base}/${name}` : name;
      if (generated.has(path) || files.has(path)) continue;
      if (lstatSync(path).isDirectory() && [...files].some(file => file.startsWith(path + "/"))) verifyTree(path);
      else throw new Error("Unexpected file or directory in the feed QA export");
    }
  }
  verifyTree();
  return approvedDigest;
}

function git(args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (result.error || result.status !== 0) throw new Error("Feed QA Git snapshot preflight failed");
  return result.stdout;
}

function collectSnapshot() {
  const root = realpathSync(".");
  if (git(["branch", "--show-current"]).trim() !== branch || git(["rev-parse", "HEAD"]).trim() !== head ||
      realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== root ||
      git(["diff", "--cached", "--name-only", "-z"])) throw new Error("Expected the unstaged M4-F02 worktree at its reviewed base");
  const list = (args: string[]) => git(args).split("\0").filter(Boolean);
  const modified = list(["diff", "--name-only", "-z", "HEAD"]).sort();
  const added = list(["ls-files", "--others", "--exclude-standard", "-z"]).sort();
  if ([...modified, ...added].some(path => !pending.has(path))) throw new Error("Unexpected working-tree changes; review export scope first");
  const paths = [...new Set([...list(["ls-files", "-z"]), ...added])].sort();
  if ([...pending].some(path => !paths.includes(path))) throw new Error("Expected reviewed files are missing");
  const contents = paths.map(path => {
    if (!allowedFeedSnapshotPath(path)) throw new Error("Tracked path is outside the safe export policy; inspect before export");
    const bytes = localFile(path);
    return { path, bytes, sha256: sha256(bytes) };
  });
  const manifest = { version: 1, branch, head, modified, untracked: added, files: contents.map(({ path, sha256 }) => ({ path, sha256 })) };
  return { contents, raw: JSON.stringify(manifest, null, 2) + "\n" };
}

function exportSnapshot(destination: string) {
  const root = realpathSync(".");
  const output = resolve(destination);
  const fromRoot = relative(root, output);
  if (existsSync(output) || !fromRoot || !/^(\.\.)(?:[\\/]|$)/.test(fromRoot) || isAbsolute(fromRoot) ||
      realpathSync(dirname(output)) !== dirname(output)) throw new Error("Use a new snapshot directory outside this worktree and on the same drive");
  const { contents, raw } = collectSnapshot();
  mkdirSync(output, { mode: 0o700 });
  for (const { path, bytes } of contents) {
    const target = resolve(output, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  }
  writeFileSync(resolve(output, manifestName), raw, { flag: "wx", mode: 0o600 });
  console.log(`Review ${contents.length} exported files. ${manifestName} SHA-256: ${sha256(raw)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [operation, argument] = process.argv.slice(2);
    if (operation === "inspect" && process.argv.length === 3) {
      const { contents, raw } = collectSnapshot();
      console.log(`${contents.length} source files. Proposed ${manifestName} SHA-256: ${sha256(raw)}`);
    } else if (operation === "export" && argument && process.argv.length === 4) exportSnapshot(argument);
    else if (operation === "verify" && argument && process.argv.length === 4) {
      verifyFeedSnapshot(argument);
      console.log("Feed QA snapshot SHA-256 and source inventory verified");
    } else throw new Error("Use: feed-qa-snapshot.mts inspect, export <new-directory>, or verify <approved-sha256>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Feed QA snapshot operation failed");
    process.exitCode = 1;
  }
}
