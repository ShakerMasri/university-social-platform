import { assertWindowsPortNotExcluded } from "./windows-exclusions.ts";
import { createServer } from "node:net";
import { OperationalError } from "./operational-errors.ts";

// Preserve the GitHub baseline for new setups; existing manifests stay authoritative.
export const postgresHostPort = 55432;

function portCheckError(port: number, error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const endpoint = `127.0.0.1:${port}`;
  // Preserve the failure category as a redacted cause, never raw socket data.
  const cause = new Error(code === "EADDRINUSE" || code === "EACCES" ? code : "Unexpected TCP preflight failure");
  const errorCode = code === "EADDRINUSE" ? "PORT_IN_USE" : code === "EACCES" ? "PORT_DENIED" : "PORT_CHECK";
  const refusal = new OperationalError(errorCode);
  // This helper keeps its safe endpoint detail; CLI formatting uses only the code.
  refusal.cause = cause;
  refusal.message = code === "EADDRINUSE" ? `Local TCP port ${endpoint} is already in use (EADDRINUSE)`
    : code === "EACCES" ? `Local TCP binding to ${endpoint} was denied; the port may be excluded or reserved (EACCES)`
    : `Local TCP binding check failed for ${endpoint}; unexpected socket error, sensitive diagnostics omitted`;
  return refusal;
}

export async function ensurePortFree(port: number) {
  try {
    await new Promise<void>((accept, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : accept()));
    });
  } catch (error) {
    throw portCheckError(port, error);
  }
}

export async function ensurePostgresPortAvailable(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new OperationalError("PORT_INVALID");
  assertWindowsPortNotExcluded(port);
  await ensurePortFree(port);
}
