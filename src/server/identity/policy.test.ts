import { describe, expect, it } from "vitest";
import { cookieOptions, digest, eligibleEmail, keyedDigest, newToken, peerAddress, tokenValid, verifyPeer } from "./policy";

describe("approved identity input and transport policy", () => {
  it("accepts exactly the approved domains without changing the existing Unicode/email equality contract", () => {
    expect(eligibleEmail(" First.Last+Course@STU.NAJAH.EDU ")).toEqual({ email: "First.Last+Course@STU.NAJAH.EDU", emailKey: "first.last+course@stu.najah.edu" });
    expect(eligibleEmail("أحمد@najah.edu").emailKey).toBe("أحمد@najah.edu");
    expect(eligibleEmail("\uA7CE@NAJAH.EDU").emailKey).toBe("\uA7CF@najah.edu");
    for (const email of ["a@sub.najah.edu", "a@najah.edu.evil.test", "a@evilnajah.edu", "a@university.test", "a@najah.edu."]) {
      expect(() => eligibleEmail(email)).toThrow();
    }
    expect(() => eligibleEmail("a@najah.edu", [])).toThrow();
    expect(eligibleEmail("a@university.test", ["university.test"]).emailKey).toBe("a@university.test");
  });
  it("does not trust a forwarded header or an unauthenticated claimed peer", () => {
    const key = "a".repeat(64);
    const headers = new Headers({ "x-usp-peer": "127.0.0.1", "x-usp-peer-signature": keyedDigest(key, "127.0.0.1"), "x-forwarded-for": "198.51.100.2" });
    expect(verifyPeer(headers, key)).toBe("127.0.0.1");
    headers.set("x-usp-peer", "198.51.100.2");
    expect(() => verifyPeer(headers, key)).toThrow();
    expect(() => verifyPeer(new Headers({ "x-forwarded-for": "127.0.0.1" }), key)).toThrow();
    expect(peerAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(() => peerAddress("not an IP")).toThrow();
  });
  it("uses independent random credentials and safe cookie options", () => {
    const one = newToken(), two = newToken();
    expect(tokenValid(one)).toBe(true); expect(one !== two).toBe(true);
    expect(tokenValid("bad")).toBe(false);
    expect(digest(one)).toMatch(/^[0-9a-f]{64}$/);
    expect(cookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookieOptions().secure).toBe(false);
  });
});
