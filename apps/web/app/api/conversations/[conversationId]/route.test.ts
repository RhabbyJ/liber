import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConversationThread: vi.fn(),
}));

vi.mock("../../../../server/messaging/service", () => ({
  getConversationThread: mocks.getConversationThread,
}));
import { GET } from "./route";

const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";

describe("conversation thread route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getConversationThread.mockResolvedValue({ id: conversationId, items: [] });
  });

  it("returns canonical messaging without waiting on optional LOI enrichment", async () => {
    const response = await GET(new Request(`https://liber.example/api/conversations/${conversationId}`), {
      params: Promise.resolve({ conversationId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      id: conversationId,
      items: [],
    });
  });

  it("fails a canonical conversation read without invoking an optional sidecar", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getConversationThread.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request(`https://liber.example/api/conversations/${conversationId}`), {
      params: Promise.resolve({ conversationId }),
    });

    expect(response.status).toBe(500);
    log.mockRestore();
  });
});
