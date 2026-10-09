import { resolve } from "node:path";
import { validateManifest, type LocalManifest } from "./targets.ts";

// Windows environment names are case insensitive. Remove ambient interpolation
// and Compose controls, then supply only the validated manifest's resource names.
export function composeEnvironment(m: LocalManifest, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  validateManifest(m);
  const env = { ...inherited };
  for (const key of Object.keys(env)) if (/^(M1B_|COMPOSE_)/i.test(key)) delete env[key];
  return {
    ...env,
    M1B_OWNER: m.owner, M1B_CONTAINER: m.container, M1B_VOLUME: m.volume, M1B_PORT: String(m.port),
  };
}

// Compare the resolved specification BEFORE up can mount or initialize storage.
// Fail closed if the Compose file acquires additional resources or mount options.
export function validateComposeConfig(value: unknown, m: LocalManifest) {
  validateManifest(m);
  const expected = {
    name: m.project,
    services: {
      postgres: {
        command: null,
        container_name: m.container,
        entrypoint: null,
        environment: {
          POSTGRES_DB: "postgres", POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256",
          POSTGRES_PASSWORD_FILE: "/run/secrets/bootstrap_password", POSTGRES_USER: "usp_m1b_bootstrap",
        },
        healthcheck: { test: ["CMD-SHELL", "pg_isready -U usp_m1b_bootstrap -d postgres"], interval: "2s", timeout: "3s", retries: 30 },
        image: m.image,
        labels: { "edu.usp.m1b.owner": m.owner },
        network_mode: "bridge",
        ports: [{ mode: "ingress", host_ip: "127.0.0.1", target: 5432, published: String(m.port), protocol: "tcp" }],
        secrets: [{ source: "bootstrap_password", target: "/run/secrets/bootstrap_password" }],
        volumes: [{ type: "volume", source: "data", target: "/var/lib/postgresql", volume: {} }],
      },
    },
    volumes: { data: { name: m.volume, labels: { "edu.usp.m1b.owner": m.owner } } },
    secrets: { bootstrap_password: { name: `${m.project}_bootstrap_password`, file: resolve(".cache/m1b/bootstrap-password") } },
  };
  const canonical = (input: unknown): string => JSON.stringify(input, (_, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
  if (canonical(value) !== canonical(expected)) throw new Error("Resolved Compose configuration differs from owned local targets; provisioning refused");
}
