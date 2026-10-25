import type { OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from "node:http";

const names = { usp_m2_pending: "usp_qa_pending", usp_m2_session: "usp_qa_session" } as const;

// Cookies are host scoped, not port scoped. The QA transport must neither send
// traditional credentials into its DB nor replace traditional browser cookies.
export function manualRequestCookies(header: string | undefined) {
  const seen = new Set<string>(), result: string[] = [];
  for (const part of header?.split(";") ?? []) {
    const entry = part.trim(), separator = entry.indexOf("=");
    if (separator < 1) continue;
    const name = entry.slice(0, separator);
    if (Object.hasOwn(names, name)) continue;
    const match = Object.entries(names).find(([, qa]) => qa === name);
    if (!match) { result.push(entry); continue; }
    if (seen.has(name)) throw new Error("Ambiguous Manual QA cookies");
    seen.add(name); result.push(match[0] + entry.slice(separator));
  }
  return result.length ? result.join("; ") : undefined;
}
export function manualResponseCookie(value: string) {
  for (const [normal, qa] of Object.entries(names)) if (value.startsWith(normal + "=")) return qa + value.slice(normal.length);
  return value;
}
function cookieHeader(value: OutgoingHttpHeader | undefined) {
  return Array.isArray(value) ? value.map(manualResponseCookie) : typeof value === "string" ? manualResponseCookie(value) : value;
}
function headersForQa(headers: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined) {
  if (Array.isArray(headers)) return headers.map((value, index) => index % 2 === 1 &&
    String(headers[index - 1]).toLowerCase() === "set-cookie" ? cookieHeader(value)! : value);
  return headers && Object.fromEntries(Object.entries(headers).map(([name, value]) =>
    [name, name.toLowerCase() === "set-cookie" ? cookieHeader(value) : value]));
}
export function isolateManualResponseCookies(response: ServerResponse) {
  const original = response.writeHead.bind(response);
  // Preserve all Node writeHead overloads; normalize both stored and direct
  // headers at their final emission boundary, including appendHeader callers.
  response.writeHead = ((status: number, message?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => {
    const stored = response.getHeader("set-cookie");
    if (stored !== undefined) response.setHeader("set-cookie", cookieHeader(stored)!);
    return typeof message === "string" ? original(status, message, headersForQa(headers)) : original(status, headersForQa(message));
  }) as typeof response.writeHead;
}
