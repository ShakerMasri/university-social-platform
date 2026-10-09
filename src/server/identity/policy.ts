import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { normalizeEmail } from "../database/validation.ts";

export const universityDomains = ["stu.najah.edu", "najah.edu"] as const;
export const syntheticDomain = "university.test";
export const challengeLifetime = 10 * 60 * 1000;
export const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
export const ipWindow = 15 * 60 * 1000;
export const ipLimit = 30;
export const pendingCookie = "usp_m2_pending";
export const sessionCookie = "usp_m2_session";

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenValid = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const keyedDigest = (key: string, value: string) => createHmac("sha256", key).update(value).digest("hex");

export function eligibleEmail(value: unknown, domains: readonly string[] = universityDomains) {
  const normalized = normalizeEmail(value);
  if (!domains.includes(normalized.emailKey.split("@")[1])) throw new Error("Ineligible email");
  return normalized;
}

export function peerAddress(value: string) {
  const ip = value.startsWith("::ffff:") ? value.slice(7) : value;
  if (!isIP(ip)) throw new Error("Invalid peer address");
  return ip;
}

export function verifyPeer(headers: Pick<Headers, "get">, key: string) {
  const ip = peerAddress(headers.get("x-usp-peer") ?? "");
  const signature = headers.get("x-usp-peer-signature");
  if (!signature || !/^[0-9a-f]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(keyedDigest(key, ip), "hex"))) {
    throw new Error("Unattested peer address");
  }
  return ip;
}

// This checkpoint uses HTTP only inside a dedicated loopback harness. HTTPS
// options are defined/tested separately, not evidence of a deployed TLS session.
export function cookieOptions(secure = false) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
}
