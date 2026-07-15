import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isRequestSameOrigin } from "./request-origin";

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
});
