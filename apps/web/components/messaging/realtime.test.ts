import { afterEach, describe, expect, it, vi } from "vitest";
import { logMessagingRealtimeJoinStatus } from "./realtime";

afterEach(() => vi.restoreAllMocks());

describe("messaging Realtime observability", () => {
  it("logs only the failed join status", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logMessagingRealtimeJoinStatus("CHANNEL_ERROR");
    expect(warning).toHaveBeenCalledWith("Messaging realtime join failed.", {
      status: "CHANNEL_ERROR",
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("conversation:");
  });

  it("logs authentication join failures without identifiers", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logMessagingRealtimeJoinStatus("AUTH_ERROR");
    expect(warning).toHaveBeenCalledWith("Messaging realtime join failed.", { status: "AUTH_ERROR" });
  });

  it("does not log healthy or ordinary closed states", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logMessagingRealtimeJoinStatus("SUBSCRIBED");
    logMessagingRealtimeJoinStatus("CLOSED");
    expect(warning).not.toHaveBeenCalled();
  });
});
