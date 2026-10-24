const messages = {
  PORT_EXCLUDED: "Selected PostgreSQL port is excluded by Windows; choose an explicit local port before new setup",
  PORT_INSPECTION: "Windows TCP exclusion check unavailable or ambiguous; setup refused without changing ports",
  PORT_INVALID: "Invalid PostgreSQL host port; setup refused",
  PORT_IN_USE: "Selected loopback TCP port is already in use (EADDRINUSE); preserve the existing listener",
  PORT_DENIED: "Selected loopback TCP port was denied (EACCES); inspect exclusions and permissions",
  PORT_CHECK: "Loopback TCP preflight failed; inspect local configuration without changing resources",
  LOCAL_CONFIG: "Local database configuration is invalid or unreadable; inspect local-database.json without printing it",
  LOCAL_PORT_CONFLICT: "Local PostgreSQL port conflicts with the isolation profile or existing manifest; preserve the recorded port and review configuration",
  LEGACY_RUNTIME: "Legacy repository runtime state requires inspection; relocation refused. Run npm run db:compatibility for metadata-only guidance; do not delete or copy state",
  RUNTIME_PERMISSIONS: "Private runtime permissions or ownership refused; preserve existing state and run npm run db:compatibility for metadata-only guidance; no automatic permission repair",
  MANIFEST_MISSING: "Local PostgreSQL setup has not been initialized; manifest is missing. Preserve any existing resources and review README Existing contributor before setup",
  MANIFEST_JSON: "Local database manifest JSON is invalid; inspect private metadata without printing it",
  SESSION_JSON: "Manual session JSON is invalid; retain evidence for inspection",
  CONTROL_JSON: "Local control JSON is invalid; retain evidence for inspection",
  LEASE_JSON: "Lifecycle lease JSON is invalid; retain evidence for inspection",
  DATABASE: "Local database operation refused or interrupted; inspect owned resources and private metadata",
  MANUAL: "Manual QA operation refused or interrupted; inspect lifecycle state, private permissions and clipboard policy",
} as const;
export type OperationalCode = keyof typeof messages;

// Never retain the parser/provider exception, input, cause or dynamic message.
export class OperationalError extends Error {
  readonly code: OperationalCode;
  constructor(code: OperationalCode) {
    super("[" + code + "] " + messages[code]);
    this.name = "OperationalError";
    this.code = code;
  }
}
export function parseOperationalJson(text: string, code: "MANIFEST_JSON" | "SESSION_JSON" | "CONTROL_JSON" | "LEASE_JSON"): unknown {
  try { return JSON.parse(text) as unknown; }
  catch { throw new OperationalError(code); }
}
export function formatOperationalError(error: unknown, manual = false): string {
  const code = error instanceof OperationalError && Object.hasOwn(messages, error.code)
    ? error.code : manual ? "MANUAL" : "DATABASE";
  return "[" + code + "] " + messages[code] + "; sensitive diagnostics omitted";
}
