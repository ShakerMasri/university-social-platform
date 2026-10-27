import { describe, expect, it } from "vitest";
import { localIdentityOriginValid, localPreviewPort } from "./local-policy";
describe("explicit local identity modes", () => {
  it("allows only exact loopback origins for their respective modes", () => {
    expect(localIdentityOriginValid("http://127.0.0.1:3100", "test")).toBe(true);
    expect(localIdentityOriginValid("http://localhost:3200", "preview")).toBe(true);
    for (const origin of ["https://localhost:3200", "http://localhost:3200/", "http://localhost.evil.test:3200", "http://0.0.0.0:3200", "http://127.0.0.1:3200", "http://localhost:3200/path", "http://u:p@localhost:3200"]) expect(localIdentityOriginValid(origin, "preview")).toBe(false);
    expect(localIdentityOriginValid("http://localhost:3200", "test")).toBe(false);
    expect(localIdentityOriginValid("http://127.0.0.1:3100", "unknown" as never)).toBe(false);
  });
  it("validates the documented preview port and reserves the automated port", () => {
    expect(localPreviewPort(undefined)).toBe(3200); expect(localPreviewPort("3000")).toBe(3000);
    for (const value of ["0", "80", "1023", "3100", "65536", "03200", "3200x", "3200.5", "", " 3200"]) expect(() => localPreviewPort(value)).toThrow();
  });
});
