import { resolve } from "node:path";
import { inspectLegacyRuntime } from "./legacy-runtime.ts";

try {
  if (process.argv.length !== 2) throw new Error("Arguments refused");
  const report = inspectLegacyRuntime();
  console.log(JSON.stringify({
    ...report, checkout: resolve("."), inspection: "known path metadata only; no file contents, credentials, ACL changes or resource queries",
    guidance: report.status === "review-required"
      ? "Preserve existing state and resources. Review README Existing contributor. No automatic migration or recovery is available."
      : "No blocking legacy markers were observed by this check; this is not a health, ACL, process or ownership verification.",
  }, null, 2));
  process.exitCode = report.status === "review-required" ? 2 : 0;
} catch {
  console.error("[COMPATIBILITY_INSPECTION] Metadata inspection unavailable; preserve existing state. No transition performed");
  process.exitCode = 1;
}
