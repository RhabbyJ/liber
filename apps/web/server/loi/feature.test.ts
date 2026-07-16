import { afterEach, describe, expect, it, vi } from "vitest";
import { loiV1Configured, loiV1EnabledForPair } from "./feature";

const buyer = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";

afterEach(() => vi.unstubAllEnvs());

describe("LOI cohort", () => {
  it("requires an enabled flag and both exact UUID participants", () => {
    vi.stubEnv("LIBER_LOI_V1_ENABLED", "true");
    vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", `${buyer},${seller}`);
    expect(loiV1EnabledForPair(buyer, seller)).toBe(true);
    expect(loiV1Configured()).toBe(true);
    expect(loiV1EnabledForPair(buyer, "33333333-3333-4333-8333-333333333333")).toBe(false);
  });

  it("fails closed for empty, malformed, disabled, and wildcard cohorts", () => {
    for (const values of [
      "",
      buyer,
      `${buyer},`,
      `${buyer},${seller},`,
      `${buyer},,${seller}`,
      `${buyer},${buyer}`,
      `${buyer},bad`,
      "*",
    ]) {
      vi.stubEnv("LIBER_LOI_V1_ENABLED", "true");
      vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", values);
      expect(loiV1EnabledForPair(buyer, seller)).toBe(false);
      expect(loiV1Configured()).toBe(false);
    }
    vi.stubEnv("LIBER_LOI_V1_ENABLED", "false");
    vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", `${buyer},${seller}`);
    expect(loiV1EnabledForPair(buyer, seller)).toBe(false);
  });

  it("rejects a multi-pilot member set instead of authorizing cross-pairs", () => {
    vi.stubEnv("LIBER_LOI_V1_ENABLED", "true");
    vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", `${buyer},${seller},33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444`);
    expect(loiV1EnabledForPair(buyer, seller)).toBe(false);
  });
});
