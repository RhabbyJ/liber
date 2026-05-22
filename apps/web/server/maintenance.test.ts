import { describe, expect, it } from "vitest";
import { INVITE_EXPIRATION_DAYS, inviteExpiresAt } from "./maintenance";

describe("marketplace maintenance", () => {
  it("sets invite expiration from the send date", () => {
    const sentAt = new Date("2026-05-20T00:00:00.000Z");

    expect(INVITE_EXPIRATION_DAYS).toBe(30);
    expect(inviteExpiresAt(sentAt).toISOString()).toBe("2026-06-19T00:00:00.000Z");
  });
});
