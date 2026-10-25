import { describe, expect, it } from "vitest";
import { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import type { Socket } from "node:net";
import { manualRequestCookies, manualResponseCookie, isolateManualResponseCookies } from "../identity/manual-cookies";
import { assertEmptyManualSetup, assertManualPortUnclaimed } from "./manual-resources";

describe("Manual QA cannot claim traditional ports or host-scoped cookies", () => {
  it.each(["bootstrap-password", "compose.env", "reviewed.sql", "unknown-retained-file"])("refuses fresh setup beside orphaned %s", (file) => {
    expect(() => assertEmptyManualSetup([file])).toThrow();
    expect(() => assertEmptyManualSetup([])).not.toThrow();
  });
  it("refuses the traditional default and any recorded binding, including a stopped container's metadata", () => {
    expect(() => assertManualPortUnclaimed(55432, null)).toThrow();
    expect(() => assertManualPortUnclaimed(55433, { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55433" }] })).toThrow();
    expect(() => assertManualPortUnclaimed(55433, { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] })).not.toThrow();
    expect(() => assertManualPortUnclaimed(55433, { "5432/tcp": null })).not.toThrow();
  });
  it.each([undefined, [], "unknown", { "5432/tcp": [{}] }, { "5432/tcp": [{ HostPort: "65536" }] }])("refuses ambiguous published-port metadata %#", (metadata) => {
    expect(() => assertManualPortUnclaimed(55433, metadata)).toThrow();
  });
  it("drops traditional credentials and forwards only the QA credentials under the app's internal names", () => {
    expect(manualRequestCookies("usp_m2_session=legacy; usp_m2_pending=old; usp_qa_session=qa; usp_qa_pending=new; locale=ar"))
      .toBe("usp_m2_session=qa; usp_m2_pending=new; locale=ar");
    expect(manualRequestCookies("usp_m2_session=legacy")).toBeUndefined();
    expect(() => manualRequestCookies("usp_qa_session=a; usp_qa_session=b")).toThrow();
  });
  it("preserves cookie security attributes, expiration and unrelated cookies", () => {
    expect(manualResponseCookie("usp_m2_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"))
      .toBe("usp_qa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(manualResponseCookie("locale=ar; Path=/")).toBe("locale=ar; Path=/");
  });
  it.each(["stored", "direct", "raw", "status-message"])("isolates %s response headers without opening a socket", (kind) => {
    // ServerResponse can serialize headers without a connected socket.
    const response = new ServerResponse({ method: "GET" } as IncomingMessage);
    isolateManualResponseCookies(response);
    if (kind === "stored") {
      response.setHeader("Set-Cookie", ["usp_m2_pending=p; HttpOnly"]);
      response.appendHeader("Set-Cookie", "usp_m2_session=s; HttpOnly"); response.writeHead(200);
    } else if (kind === "direct") response.writeHead(200, { "Set-Cookie": ["usp_m2_pending=p; HttpOnly", "usp_m2_session=s; HttpOnly"] });
    else if (kind === "raw") response.writeHead(200, ["Set-Cookie", "usp_m2_pending=p; HttpOnly", "Set-Cookie", "usp_m2_session=s; HttpOnly"]);
    else response.writeHead(200, "OK", { "Set-Cookie": ["usp_m2_pending=p; HttpOnly", "usp_m2_session=s; HttpOnly"] });
    // The public getHeader API covers stored headers; raw writeHead serialization
    // is exposed through a tiny fake socket capture instead of private fields.
    const chunks: string[] = [];
    const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { chunks.push(String(chunk)); done(); } });
    // No connection or native transport exists in this serialization fixture.
    response.assignSocket(socket as unknown as Socket);
    response.end();
    const emitted = chunks.join("");
    expect(emitted).toContain("usp_qa_pending=p"); expect(emitted).toContain("usp_qa_session=s");
    expect(emitted).not.toContain("usp_m2_");
    socket.destroy();
  });
});
