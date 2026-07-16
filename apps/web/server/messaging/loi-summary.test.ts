import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getLoiForConversation: vi.fn() }));

vi.mock("../loi/service", () => ({
  getLoiForConversation: mocks.getLoiForConversation,
}));

import { getMessagingLoiSummary } from "./loi-summary";

describe("messaging LOI summary", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns the authorized LOI sidecar when it is available", async () => {
    mocks.getLoiForConversation.mockResolvedValue({
      available: true,
      id: "019f62c5-1c07-4a62-9f9a-8302778aa011",
      privateTerms: { purchasePriceCents: 100_000_000 },
      status: "AWAITING_SELLER_RESPONSE",
    });

    await expect(getMessagingLoiSummary("conversation-1")).resolves.toEqual({
      available: true,
      id: "019f62c5-1c07-4a62-9f9a-8302778aa011",
      status: "AWAITING_SELLER_RESPONSE",
    });
  });

  it("fails the optional sidecar closed without exposing error details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getLoiForConversation.mockRejectedValue(new Error("private database detail"));

    await expect(getMessagingLoiSummary("conversation-1")).resolves.toEqual({ available: false });
    await expect(getMessagingLoiSummary("conversation-1")).resolves.toEqual({ available: false });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Messaging LOI summary unavailable.", {
      code: "LOI_SUMMARY_UNAVAILABLE",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
  });
});
