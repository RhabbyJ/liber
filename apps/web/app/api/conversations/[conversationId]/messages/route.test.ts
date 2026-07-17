import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  sameOrigin: true,
  send: vi.fn(),
}));

vi.mock("../../../../../server/messaging/service", () => ({
  listConversationMessages: mocks.list,
  sendConversationMessage: mocks.send,
}));

vi.mock("../../../../../server/request-origin", () => ({
  isRequestSameOrigin: () => mocks.sameOrigin,
}));

import { POST } from "./route";

const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const clientMessageId = "019f62c5-1c07-4a62-9f9a-8302778aa012";

describe("conversation message route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin = true;
    mocks.send.mockResolvedValue({ data: { id: "message" }, idempotent: false });
  });

  it("rejects cross-origin mutation before invoking messaging services", async () => {
    mocks.sameOrigin = false;
    const response = await POST(request({
      body: "Hello",
      clientMessageId,
      kind: "FREE_TEXT",
    }), context());

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Invalid origin." });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("passes only validated fields and returns private no-store JSON", async () => {
    const response = await POST(request({
      body: "  Hello\r\nthere  ",
      clientMessageId,
      kind: "FREE_TEXT",
    }), context());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.send).toHaveBeenCalledWith({
      body: "Hello\nthere",
      clientMessageId,
      conversationId,
      kind: "FREE_TEXT",
    });
  });

  it("passes a validated buyer quick reply to the messaging service", async () => {
    const response = await POST(request({
      clientMessageId,
      kind: "GUIDED",
      templateKey: "BUYER_MORE_DETAILS",
      templateVersion: 1,
    }), context());

    expect(response.status).toBe(201);
    expect(mocks.send).toHaveBeenCalledWith({
      clientMessageId,
      conversationId,
      kind: "GUIDED",
      templateKey: "BUYER_MORE_DETAILS",
      templateVersion: 1,
    });
  });

  it("rejects unknown or malformed body fields without echoing them", async () => {
    const response = await POST(request({
      body: "secret body",
      clientMessageId: "not-a-uuid",
      extra: "do-not-echo",
      kind: "FREE_TEXT",
    }), context());

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("secret body");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects non-JSON and oversized request bodies before invoking messaging services", async () => {
    const nonJsonResponse = await POST(request({
      body: "Hello",
      clientMessageId,
      kind: "FREE_TEXT",
    }, "text/plain"), context());
    expect(nonJsonResponse.status).toBe(400);

    const oversizedResponse = await POST(new Request("https://liber.example/api/conversations/messages", {
      body: JSON.stringify({
        body: "x".repeat(17_000),
        clientMessageId,
        kind: "FREE_TEXT",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }) as never, context());
    expect(oversizedResponse.status).toBe(413);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

function request(body: unknown, contentType = "application/json") {
  return new Request("https://liber.example/api/conversations/messages", {
    body: JSON.stringify(body),
    headers: { "Content-Type": contentType, Origin: "https://liber.example" },
    method: "POST",
  }) as never;
}

function context() {
  return { params: Promise.resolve({ conversationId }) };
}
