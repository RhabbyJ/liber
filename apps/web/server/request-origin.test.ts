import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isRequestSameOrigin, requestUrl } from "./request-origin";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://liber.example/api/conversations", { headers });
}

describe("isRequestSameOrigin", () => {
  it("accepts an exact Origin match", () => {
    expect(isRequestSameOrigin(request({ origin: "https://liber.example" }))).toBe(true);
  });

  it("rejects a cross-origin request even when another fetch signal is forged", () => {
    expect(isRequestSameOrigin(request({
      origin: "https://attacker.example",
      "sec-fetch-site": "same-origin",
    }))).toBe(false);
  });

  it("accepts a browser-declared same-origin request when Origin is omitted", () => {
    expect(isRequestSameOrigin(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("fails closed when neither trustworthy browser signal is present", () => {
    expect(isRequestSameOrigin(request())).toBe(false);
    expect(isRequestSameOrigin(request({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isRequestSameOrigin(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it.each(["cross-site", "same-site"])("rejects conflicting %s fetch metadata", (site) => {
    expect(isRequestSameOrigin(request({ origin: "https://liber.example", "sec-fetch-site": site }))).toBe(false);
  });

  it.each(["javascript", "https,http", "https://attacker.test/path"])("rejects invalid forwarded protocol %j", (protocol) => {
    expect(isRequestSameOrigin(request({ "x-forwarded-proto": protocol, "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it.each(["liber.example@attacker.test", "liber.example/path", "liber.example,attacker.test"])("rejects malformed Host %j", (host) => {
    expect(isRequestSameOrigin(request({ host, "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(requestUrl(request({ host }), "/login").origin).toBe("https://liber.example");
  });

  it("keeps local development ports and hostnames consistent", () => {
    const local = new NextRequest("http://localhost:3000/login", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-forwarded-proto": "http" },
    });
    expect(isRequestSameOrigin(local)).toBe(true);
    expect(requestUrl(local, "/profile").href).toBe("http://127.0.0.1:3000/profile");
  });
});
