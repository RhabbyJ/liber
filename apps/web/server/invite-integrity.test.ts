import { describe, expect, it } from "vitest";
import {
  assertInviteParticipants,
  effectiveInviteStatus,
  inviteDeadline,
  inviteIsExpired,
} from "./invite-integrity";

describe("invite use-time integrity", () => {
  const sentAt = new Date("2026-06-01T00:00:00.000Z");

  it("treats an invite as expired at the exact deadline even before maintenance runs", () => {
    const invite = { expiresAt: new Date("2026-07-01T00:00:00.000Z"), sentAt, status: "SENT" };
    const deadline = new Date("2026-07-01T00:00:00.000Z");

    expect(inviteIsExpired(invite, deadline)).toBe(true);
    expect(effectiveInviteStatus(invite, deadline)).toBe("EXPIRED");
  });

  it("derives a safe deadline for legacy rows that did not store one", () => {
    expect(inviteDeadline({ expiresAt: null, sentAt }).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("requires exact seller ownership and denies self-invites", () => {
    expect(() => assertInviteParticipants({
      buyerUserId: "buyer-1",
      propertyOwnerUserId: "seller-2",
      sellerId: "seller-1",
    })).toThrow("Seller must own property");

    expect(() => assertInviteParticipants({
      buyerUserId: "seller-1",
      propertyOwnerUserId: "seller-1",
      sellerId: "seller-1",
    })).toThrow("Sellers cannot invite their own buyer profile.");
  });
});
