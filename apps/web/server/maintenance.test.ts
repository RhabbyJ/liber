import { describe, expect, it } from "vitest";
import { INVITE_RESPONSE_WINDOW_MS, inviteExpiresAt } from "./maintenance";

describe("marketplace maintenance", () => {
  it("sets invite expiration from the send date", () => {
    const sentAt = new Date("2026-05-20T00:00:00.000Z");

    expect(INVITE_RESPONSE_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
    expect(inviteExpiresAt(sentAt).toISOString()).toBe("2026-05-22T00:00:00.000Z");
  });
});
