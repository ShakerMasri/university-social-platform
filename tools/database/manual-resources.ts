import { OperationalError } from "./operational-errors.ts";

export function assertEmptyManualSetup(entries: string[]) {
  if (entries.length) throw new OperationalError("MANUAL");
}

// Inspect only Docker's published-port metadata, including stopped containers.
// No manifest/credentials from the traditional runtime are read or adopted.
export function assertManualPortUnclaimed(port: number, bindings: unknown) {
  if (port === 55432) throw new OperationalError("MANUAL_PORT_CONFLICT"); // Traditional new-setup default.
  if (bindings === null) return;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) throw new OperationalError("PORT_CHECK");
  for (const value of Object.values(bindings)) {
    if (value === null) continue;
    if (!Array.isArray(value)) throw new OperationalError("PORT_CHECK");
    for (const binding of value) {
      if (!binding || typeof binding !== "object" || typeof binding.HostPort !== "string" ||
          !/^[0-9]+$/.test(binding.HostPort) || Number(binding.HostPort) < 1 || Number(binding.HostPort) > 65535) throw new OperationalError("PORT_CHECK");
      if (Number(binding.HostPort) === port) throw new OperationalError("MANUAL_PORT_CONFLICT");
    }
  }
}
