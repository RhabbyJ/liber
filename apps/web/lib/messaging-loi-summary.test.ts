import { describe, expect, it } from "vitest";
import { normalizeMessagingLoiSummary } from "./messaging-loi-summary";

const negotiationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const inviteId = "cm0loiinvite000000000000001";

describe("messaging LOI summary normalization", () => {
  it("keeps only the messaging-safe fields", () => {
    expect(normalizeMessagingLoiSummary({
      available: true,
      id: negotiationId,
      privateTerms: { purchasePriceCents: 100_000_000 },
      status: "AWAITING_SELLER_RESPONSE",
    })).toEqual({
      available: true,
      id: negotiationId,
      status: "AWAITING_SELLER_RESPONSE",
    });

    expect(normalizeMessagingLoiSummary({
      available: true,
      canCreate: false,
      inviteId,
      status: "NOT_STARTED",
    })).toEqual({
      available: true,
      canCreate: false,
      inviteId,
      status: "NOT_STARTED",
    });
  });

  it("fails closed on malformed optional fields or an unusable link", () => {
    for (const value of [
      { available: true, status: "NOT_STARTED" },
      { available: true, id: "not-a-uuid", status: "READ_ONLY" },
      { available: true, inviteId: " padded ", status: "NOT_STARTED" },
      { available: true, inviteId, status: undefined },
      { available: true, canCreate: "yes", inviteId, status: "NOT_STARTED" },
      { available: false, id: negotiationId, privateTerms: "must be discarded" },
    ]) {
      expect(normalizeMessagingLoiSummary(value)).toEqual({ available: false });
    }
  });
});
