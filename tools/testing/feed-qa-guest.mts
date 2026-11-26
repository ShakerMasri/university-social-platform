import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { LocalManifest } from "../database/targets.ts";

function read(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("Feed QA guest preflight could not verify the environment");
  return result.stdout.trim();
}

type Interface = { ifname: string; master?: string; flags: string[]; addr_info?: unknown[] };

export function permitsOfflineInterfaces(interfaces: Interface[]) {
  return interfaces.some(link => link.ifname === "lo") && interfaces.every(link =>
    link.ifname === "lo" || link.ifname === "docker0" ||
    (link.master === "docker0" && /^veth[0-9a-f]+$/.test(link.ifname) && !link.addr_info?.length) ||
    (!link.flags.includes("LOWER_UP") && !link.addr_info?.length));
}

export function assertFeedQaGuest() {
  if (process.platform !== "linux" || process.arch !== "x64" || process.getuid?.() === 0 ||
      Object.keys(process.env).some(key => /^(DOCKER_|PG[A-Z]|DATABASE_URL$|M1B_|M2_|M4_FEED_|USP_|PLAYWRIGHT_|NODE_OPTIONS$|NODE_ENV$|CI$)/i.test(key))) {
    throw new Error("Feed QA requires a clean, non-root Linux guest shell");
  }
  const release = readFileSync("/etc/os-release", "utf8");
  if (!/^ID="?ubuntu"?$/m.test(release) || !/^VERSION_ID="?24\.04"?$/m.test(release) ||
      read("systemd-detect-virt", []) !== "vmware" || process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    throw new Error("Feed QA requires the approved Ubuntu 24.04 VMware guest");
  }
  const interfaces = JSON.parse(read("ip", ["-j", "address", "show"])) as Interface[];
  if (!permitsOfflineInterfaces(interfaces) || read("ip", ["-4", "route", "show", "default"]) ||
      read("ip", ["-6", "route", "show", "default"])) {
    throw new Error("Disconnect the guest NIC and remove its addresses and default routes before feed QA");
  }
  const mounts = read("findmnt", ["-rn", "-o", "FSTYPE"]).split(/\s+/);
  if (mounts.some(type => /^(?:9p|virtiofs|vboxsf|hgfs|cifs|smb\d*|nfs\d*|fuse(?:\.|$))/i.test(type))) {
    throw new Error("Feed QA refuses shared or remote filesystem mounts");
  }
  const socket = realpathSync("/var/run/docker.sock");
  if (socket !== "/run/docker.sock" || !lstatSync(socket).isSocket() ||
      realpathSync(".") !== resolve(".") || realpathSync(".cache/m1b") !== resolve(".cache/m1b") ||
      !lstatSync(".cache/m1b/manifest.json").isFile()) {
    throw new Error("Feed QA requires the guest socket and its own local manifest");
  }
}

export function assertFeedQaEngine(manifest: LocalManifest) {
  if (!manifest.containerId || manifest.dockerContext !== "default" || manifest.dockerEndpoint !== "unix:///var/run/docker.sock" ||
      read("docker", ["context", "show"]) !== "default" ||
      read("docker", ["context", "inspect", "default", "--format", "{{.Endpoints.docker.Host}}"]) !== manifest.dockerEndpoint ||
      read("docker", ["info", "--format", "{{.OSType}} {{.DockerRootDir}}"]) !== "linux /var/lib/docker" ||
      read("docker", ["ps", "-aq", "--no-trunc"]) !== manifest.containerId ||
      read("docker", ["volume", "ls", "-q"]) !== manifest.volume) {
    throw new Error("Feed QA refuses any engine other than the guest's dedicated PostgreSQL setup");
  }
}
