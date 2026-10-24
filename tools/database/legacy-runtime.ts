import { lstatSync, type Stats } from "node:fs";
import { resolve } from "node:path";

export const legacyMarkerNames = ["m1b", "manual-identity", "m2-browser.json", "local-db-operation.lock", "local-db-operation.gate"] as const;
type Kind = "directory" | "file" | "link" | "unknown";
export type LegacyInspection = {
  status: "clear" | "review-required";
  markers: { name: string; kind: Kind; reason?: "metadata" | "type" | "permissions-or-owner" }[];
  lifecycleEvidence: "not-inspected";
  transition: "not-implemented";
};
type Metadata = Pick<Stats, "isSymbolicLink" | "isDirectory" | "isFile" | "mode" | "uid">;

export function hasPrivatePosixPermissions(stat: Pick<Stats, "mode" | "uid">, runtimeRoot: boolean, uid: number | undefined) {
  // The shared .cache container may be listable, but sensitive children may not.
  return uid !== undefined && stat.uid === uid && (stat.mode & (runtimeRoot ? 0o022 : 0o077)) === 0;
}

// No readFile, write, subprocess, SQL or Docker capability. Presence is a reason
// to preserve evidence, never proof that a legacy run stopped or belongs to us.
export function inspectLegacyRuntime(checkout = resolve("."), platform = process.platform,
  inspect: (path: string) => Metadata = lstatSync, uid = process.getuid?.()): LegacyInspection {
  const markers: LegacyInspection["markers"] = [];
  const result = (status: LegacyInspection["status"]): LegacyInspection => ({
    status, markers, lifecycleEvidence: "not-inspected", transition: "not-implemented",
  });
  const stat = (path: string): Metadata | "unknown" | null => {
    try { return inspect(path); }
    catch (error) {
      return error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? null : "unknown";
    }
  };
  const cache = stat(resolve(checkout, ".cache"));
  if (cache === null) return result("clear");
  if (platform !== "win32") {
    // Known directory metadata only: never traverse a linked, ambiguous or
    // incompatible parent, enumerate contents, or repair existing permissions.
    const check = (name: string, entry: Metadata | "unknown", root: boolean) => {
      const kind = entry === "unknown" ? "unknown" : entry.isSymbolicLink() ? "link"
        : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "unknown";
      const reason = entry === "unknown" ? "metadata" : kind !== "directory" ? "type"
        : !hasPrivatePosixPermissions(entry, root, uid) ? "permissions-or-owner" : null;
      if (reason) markers.push({ name, kind, reason });
      return reason === null;
    };
    if (check(".cache", cache, true)) {
      for (const name of ["m1b", "manual-identity"]) {
        const entry = stat(resolve(checkout, ".cache", name));
        if (entry !== null) check(name, entry, false);
      }
    }
    return result(markers.length ? "review-required" : "clear");
  }
  if (cache === "unknown" || cache.isSymbolicLink() || !cache.isDirectory()) {
    markers.push({ name: ".cache", kind: cache === "unknown" ? "unknown" : cache.isSymbolicLink() ? "link" : "file" });
    return result("review-required"); // Never traverse a linked/ambiguous parent.
  }
  for (const name of legacyMarkerNames) {
    const entry = stat(resolve(checkout, ".cache", name));
    if (entry !== null) markers.push({ name, kind: entry === "unknown" ? "unknown" : entry.isSymbolicLink() ? "link"
      : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "unknown" });
  }
  return result(markers.length ? "review-required" : "clear");
}
