import { manualPaths } from "./manual-paths";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

import { manualPostgresPort as postgresHostPort } from "./manual-paths";
import { composeEnvironment, validateComposeConfig } from "./manual-compose";
import { databaseUrl, image, type LocalManifest } from "./manual-targets";

const owner = "abcdef123456";
const project = `usp-qa-${owner}`;
const m: LocalManifest = {
  version: 1, root: resolve("."), owner, project, container: `${project}-postgres`,
  dockerContext: "desktop-linux", dockerEndpoint: "npipe:////./pipe/dockerDesktopLinuxEngine", containerId: null,
  volume: `${project}-data`, image, port: postgresHostPort,
  migrationRole: `usp_qa_${owner}_migrate`, migrationPassword: "b".repeat(64),
  runtimeRole: `usp_qa_${owner}_runtime`, runtimePassword: "c".repeat(64),
  databases: [{ name: `usp_qa_${owner}_dev`, kind: "development", ready: false }],
};

// Synthetic resolved config fixture; no engine connection, volume or container.
function config() {
  return {
    name: project,
    services: { postgres: {
      command: null, entrypoint: null,
      container_name: m.container, image, network_mode: "bridge", labels: { "edu.usp.qa.owner": owner },
      environment: { POSTGRES_USER: "usp_qa_bootstrap", POSTGRES_DB: "postgres",
        POSTGRES_PASSWORD_FILE: "/run/secrets/bootstrap_password", POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256" },
      healthcheck: { test: ["CMD-SHELL", "pg_isready -U usp_qa_bootstrap -d postgres"], interval: "2s", timeout: "3s", retries: 30 },
      ports: [{ mode: "ingress", host_ip: "127.0.0.1", target: 5432, published: String(m.port), protocol: "tcp" }],
      secrets: [{ source: "bootstrap_password", target: "/run/secrets/bootstrap_password" }],
      volumes: [{ type: "volume", source: "data", target: "/var/lib/postgresql", volume: {} }],
    } },
    volumes: { data: { name: m.volume, labels: { "edu.usp.qa.owner": owner } } },
    secrets: { bootstrap_password: { name: `${project}_bootstrap_password`, file: manualPaths.bootstrapPasswordPath } },
  };
}

describe("Compose provisioning preflight", () => {
  it("uses the verified host port consistently while keeping container port 5432", () => {
    expect(postgresHostPort).toBe(55433);
    expect(composeEnvironment(m).M1B_PORT).toBe(String(postgresHostPort));
    expect(config().services.postgres.ports[0]).toMatchObject({ host_ip: "127.0.0.1", published: String(postgresHostPort), target: 5432 });
    expect(new URL(databaseUrl(m, m.databases[0].name, "runtime")).port).toBe(String(postgresHostPort));
    expect(new URL(databaseUrl(m, m.databases[0].name, "migration")).port).toBe(String(postgresHostPort));
    expect(() => validateComposeConfig(config(), m)).not.toThrow();
  });

  it("checks an existing manifest's port rather than overriding it with the new default", () => {
    const existing = { ...m, port: 25432 }, resolved = config();
    resolved.services.postgres.ports[0].published = String(existing.port);
    expect(composeEnvironment(existing).M1B_PORT).toBe("25432");
    expect(() => validateComposeConfig(resolved, existing)).not.toThrow();
    expect(() => validateComposeConfig(config(), existing)).toThrow("provisioning refused");
  });

  it("makes validated manifest values authoritative over all inherited overrides", () => {
    const inherited = { NODE_ENV: "test" as const, PATH: "synthetic-path", DOCKER_CONTEXT: "desktop-linux", M1B_OWNER: "other",
      M1B_CONTAINER: "synthetic-unowned-container", M1B_VOLUME: "synthetic-unowned-volume", M1B_PORT: "65432", M1B_BOOTSTRAP_FILE: "synthetic-unowned-file",
      m1b_volume: "synthetic-lowercase-volume", COMPOSE_FILE: "other.yaml", compose_project_name: "other",
      COMPOSE_PROFILES: "other", COMPOSE_ENV_FILES: "other.env", M1B_FUTURE_VARIABLE: "other" };
    expect(composeEnvironment(m, inherited)).toEqual({ NODE_ENV: "test", PATH: inherited.PATH, DOCKER_CONTEXT: inherited.DOCKER_CONTEXT,
      M1B_OWNER: m.owner, M1B_CONTAINER: m.container, M1B_VOLUME: m.volume, M1B_PORT: String(m.port), M1B_BOOTSTRAP_FILE: manualPaths.bootstrapPasswordPath });
    expect(inherited.M1B_VOLUME).toBe("synthetic-unowned-volume");
    expect(() => composeEnvironment({ ...m, volume: "synthetic-unowned-volume" }, inherited)).toThrow();
  });

  it("accepts the exact owned resolved configuration regardless of key order", () => {
    expect(() => validateComposeConfig(config(), m)).not.toThrow();
    const reordered = Object.fromEntries(Object.entries(config()).reverse());
    expect(() => validateComposeConfig(reordered, m)).not.toThrow();
  });

  it("rejects changed resources, external storage and extra mounts before startup", () => {
    const changes: ((c: ReturnType<typeof config>) => void)[] = [
      (c) => { c.name = "synthetic-unowned-project"; },
      (c) => { c.services.postgres.container_name = "synthetic-unowned-container"; },
      (c) => { c.services.postgres.labels["edu.usp.qa.owner"] = "synthetic-unowned-owner"; },
      (c) => { c.services.postgres.ports[0].published = "65432"; },
      (c) => { c.services.postgres.ports[0].host_ip = "0.0.0.0"; },
      (c) => { c.volumes.data.name = "synthetic-unowned-volume"; },
      (c) => { Object.assign(c.volumes.data, { external: true }); },
      (c) => { c.services.postgres.volumes.push({ type: "bind", source: "synthetic-unowned-directory", target: "/other", volume: {} }); },
      (c) => { c.secrets.bootstrap_password.file = resolve("synthetic-unowned-secret"); },
      (c) => { Object.assign(c.services, { extra: { image: "synthetic-image" } }); },
    ];
    for (const change of changes) {
      const value = config();
      change(value);
      expect(() => validateComposeConfig(value, m)).toThrow("provisioning refused");
    }
    expect(() => validateComposeConfig(null, m)).toThrow();
  });
});

// Pure QA fixtures never depend on the developer's Windows environment.
beforeEach(() => { vi.stubEnv("LOCALAPPDATA", resolve("synthetic-local-appdata")); });
afterEach(() => { vi.unstubAllEnvs(); });
