import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { communityBody, InputError } from "./http";

const origin = "http://localhost:3100";
const request = (body: string | ReadableStream<Uint8Array>, contentType = "application/json", query = "") => new NextRequest(`${origin}/api/communities${query}`, {
  method: "POST", headers: { "content-type": contentType, "content-length": "1" }, body,
});
describe("shared bounded JSON body reader", () => {
  it.each(["application/json", "Application/JSON", "aPpLiCaTiOn/JsOn", "Application/JSON; CHARSET=UTF-8", "application/json; profile=legacy"])("accepts the JSON type with casing %s without imposing messaging-only parameters", async contentType => {
    expect(await communityBody(request('{"name":"Synthetic"}', contentType))).toEqual({ name: "Synthetic" });
  });
  it.each(["application/jsonx", "application/json+problem", "text/json"])("rejects a different media type %s", async contentType => {
    await expect(communityBody(request("{}", contentType))).rejects.toBeInstanceOf(InputError);
  });
  it.each([1024, 2048, 8192, 32768])("bounds actual streamed bytes at %s despite a forged Content-Length", async maximumBytes => {
    function stream(bytes: Uint8Array) {
      let offset = 0;
      return new ReadableStream<Uint8Array>({ pull(controller) {
        if (offset === bytes.length) { controller.close(); return; }
        const next = Math.min(offset + 517, bytes.length); controller.enqueue(bytes.slice(offset, next)); offset = next;
      } });
    }
    const overhead = Buffer.byteLength(JSON.stringify({ value: "" }));
    const value = "x".repeat(maximumBytes - overhead), bytes = new TextEncoder().encode(JSON.stringify({ value }));
    expect(bytes.byteLength).toBe(maximumBytes);
    expect(await communityBody(request(stream(bytes), "Application/JSON"), maximumBytes)).toEqual({ value });
    await expect(communityBody(request(stream(new TextEncoder().encode(JSON.stringify({ value: value + "x" }))), "Application/JSON"), maximumBytes)).rejects.toBeInstanceOf(InputError);
  });
  it.each(["[]", "null", "{"])("keeps invalid or non-object JSON denied: %s", async body => {
    await expect(communityBody(request(body, "Application/JSON"))).rejects.toBeInstanceOf(InputError);
  });
  it("rejects query parameters before reading a valid mixed-case request", async () => {
    await expect(communityBody(request("{}", "Application/JSON", "?actor=forged"))).rejects.toBeInstanceOf(InputError);
  });
});
