import { describe, expect, it } from "vitest";
import { canDraftLoi, isTerminalLoiStatus, loiAllowedActions } from "./policy";

describe("LOI state policy", () => {
  it("allows only the buyer to prepare revision one", () => {
    expect(canDraftLoi("AWAITING_BUYER_SUBMISSION", 0, "BUYER")).toBe(true);
    expect(canDraftLoi("AWAITING_BUYER_SUBMISSION", 0, "SELLER")).toBe(false);
  });

  it("strictly alternates counter authors", () => {
    expect(canDraftLoi("AWAITING_SELLER_RESPONSE", 1, "SELLER")).toBe(true);
    expect(canDraftLoi("AWAITING_SELLER_RESPONSE", 1, "BUYER")).toBe(false);
    expect(canDraftLoi("AWAITING_BUYER_RESPONSE", 2, "BUYER")).toBe(true);
    expect(canDraftLoi("AWAITING_BUYER_RESPONSE", 2, "SELLER")).toBe(false);
  });

  it("allows only the current author to withdraw before a response", () => {
    expect(loiAllowedActions("AWAITING_BUYER_SUBMISSION", 0, null, "BUYER", false)).toContain("WITHDRAW");
    expect(loiAllowedActions("AWAITING_SELLER_RESPONSE", 1, "BUYER", "BUYER", false)).toEqual(["WITHDRAW"]);
    expect(loiAllowedActions("AWAITING_SELLER_RESPONSE", 1, "BUYER", "SELLER", false)).not.toContain("WITHDRAW");
  });

  it("makes expired and terminal negotiations non-actionable", () => {
    expect(loiAllowedActions("AWAITING_SELLER_RESPONSE", 1, "BUYER", "SELLER", true)).toEqual([]);
    for (const status of ["TERMS_ALIGNED", "DECLINED", "WITHDRAWN", "EXPIRED", "READ_ONLY"]) {
      expect(isTerminalLoiStatus(status)).toBe(true);
      expect(loiAllowedActions(status, 1, "BUYER", "SELLER", false)).toEqual([]);
    }
  });
});
