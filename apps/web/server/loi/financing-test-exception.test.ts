import { describe, expect, it } from "vitest";
import { financingTestExceptionExpiresAt } from "./financing-test-exception";

const buyer = "11111111-1111-4111-8111-111111111111";
const negotiation = "33333333-3333-4333-8333-333333333333";
const now = Date.parse("2026-10-07T03:00:00.000Z");
const expiry = "2026-10-08T03:00:00.000Z";
const env = {
  LIBER_LOI_TEST_FINANCING_BUYER_ID: buyer,
  LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID: negotiation,
  LIBER_LOI_TEST_FINANCING_EXPIRES_AT: expiry,
};

describe("temporary LOI financing exception", () => {
  it("allows only the configured buyer and negotiation before expiration", () => {
    expect(financingTestExceptionExpiresAt(buyer, negotiation, env, now)).toBe(expiry);
    expect(financingTestExceptionExpiresAt("22222222-2222-4222-8222-222222222222", negotiation, env, now)).toBeNull();
    expect(financingTestExceptionExpiresAt(buyer, "44444444-4444-4444-8444-444444444444", env, now)).toBeNull();
    expect(financingTestExceptionExpiresAt(buyer, negotiation, env, Date.parse(expiry))).toBeNull();
  });

  it.each([undefined, "", "*", "not-a-date", "2026-10-08", "2026-02-30T03:00:00.000Z"])("rejects malformed expiration %s", (value) => {
    expect(financingTestExceptionExpiresAt(buyer, negotiation, { ...env, LIBER_LOI_TEST_FINANCING_EXPIRES_AT: value }, now)).toBeNull();
  });

  it.each(["LIBER_LOI_TEST_FINANCING_BUYER_ID", "LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID"])("requires one UUID for %s", (key) => {
    for (const value of [undefined, "", "*", `${buyer},${negotiation}`]) {
      expect(financingTestExceptionExpiresAt(buyer, negotiation, { ...env, [key]: value }, now)).toBeNull();
    }
  });
});
