import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeConversationAccess: vi.fn(),
  getMessagingLoiSummary: vi.fn(),
}));

vi.mock("../../../../../server/messaging/service", () => ({
  authorizeConversationAccess: mocks.authorizeConversationAccess,
}));
vi.mock("../../../../../server/messaging/loi-summary", () => ({
  getMessagingLoiSummary: mocks.getMessagingLoiSummary,
}));

import { GET } from "./route";

const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";

describe("conversation LOI sidecar route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorizeConversationAccess.mockResolvedValue(undefined);
    mocks.getMessagingLoiSummary.mockResolvedValue({ available: false });
  });

  it("authorizes the conversation before returning the private sidecar", async () => {
    const response = await GET(new Request(`https://liber.example/api/conversations/${conversationId}/loi`), {
      params: Promise.resolve({ conversationId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.authorizeConversationAccess).toHaveBeenCalledWith(conversationId);
    expect(mocks.getMessagingLoiSummary).toHaveBeenCalledWith(conversationId);
    await expect(response.json()).resolves.toEqual({ available: false });
  });

  it("does not query LOI state when conversation authorization fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authorizeConversationAccess.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request(`https://liber.example/api/conversations/${conversationId}/loi`), {
      params: Promise.resolve({ conversationId }),
    });

    expect(response.status).toBe(500);
    expect(mocks.getMessagingLoiSummary).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
