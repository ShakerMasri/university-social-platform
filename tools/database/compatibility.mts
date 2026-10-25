import { resolve } from "node:path";
import { inspectLegacyRuntime } from "./legacy-runtime.ts";

try {
  if (process.argv.length !== 2) throw new Error("Arguments refused");
  const report = inspectLegacyRuntime();
  console.log(JSON.stringify({
    ...report, operationalGate: false, checkout: resolve("."), inspection: "historical shared-runtime metadata only; no file contents, credentials, ACL changes or resource queries",
    guidance: report.status === "review-required"
      ? "Preserve existing state and resources. Traditional commands retain current-main behavior; this legacy QA inventory does not gate them. Review README Existing contributor before reusing old shared QA state; no automatic permission repair, migration or recovery is available."
      : "No blocking known directory metadata was observed by this check; file permissions, Windows ACLs, processes, resources and lifecycle health are not verified.",
  }, null, 2));
  process.exitCode = report.status === "review-required" ? 2 : 0;
} catch {
  console.error("[COMPATIBILITY_INSPECTION] Metadata inspection unavailable; preserve existing state. No transition performed");
  process.exitCode = 1;
}
