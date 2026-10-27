export type LocalIdentityMode = "test" | "preview";
export function localIdentityOriginValid(origin: string, mode: LocalIdentityMode) {
  if (mode !== "test" && mode !== "preview") return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  const port = Number(url.port);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 &&
    origin === `http://${mode === "preview" ? "localhost" : "127.0.0.1"}:${port}`;
}
export function localPreviewPort(value: string | undefined) {
  const raw = value ?? "3200";
  if (!/^[1-9][0-9]{3,4}$/.test(raw)) throw new Error("USP_LOCAL_PREVIEW_PORT must be an integer from 1024 to 65535");
  const port = Number(raw);
  if (port < 1024 || port > 65535 || port === 3100) throw new Error("Preview port must be 1024–65535 and cannot use the automated runner's 3100");
  return port;
}
