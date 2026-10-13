import { describe, expect, it } from "vitest";
import { supportedBadgeTypes, type OwnerBuyerProfileDTO, type SellerBuyerSummaryDTO } from "./buyer-dtos";
import { hasVerifiedPreviewBadge, TEST_PREAPPROVAL_LABEL, withOwnerTestPreapproval, withSellerTestPreapproval } from "./test-preapproval";

describe("test badge presentation isolation", () => {
  const real = { id: "real-evidence-badge", type: "PRE_APPROVED", label: "Admin-verified pre-approval", status: "active" as const };
  it("preserves real badges and adds a distinctly identified owner marker", () => {
    const buyer = { id: "profile", badges: [real] } as OwnerBuyerProfileDTO;
    expect(withOwnerTestPreapproval(buyer, new Set())).toBe(buyer);
    const marked = withOwnerTestPreapproval(buyer, new Set([buyer.id]));
    expect(marked.badges[0]).toEqual(real);
    expect(marked.badges[1]).toMatchObject({ type: "TEST_PRE_APPROVED", label: TEST_PREAPPROVAL_LABEL });
    expect(marked.badges.filter((badge) => badge.type === "PRE_APPROVED")).toHaveLength(1);
    expect(buyer.badges).toEqual([real]);
  });
  it("does not add a real financial badge, private marker ID, or evidence to the seller DTO", () => {
    const buyer = { id: "profile", badges: [] } as unknown as SellerBuyerSummaryDTO;
    const marked = withSellerTestPreapproval(buyer, new Set([buyer.id]));
    expect(marked.badges).toEqual([{ type: "TEST_PRE_APPROVED", label: TEST_PREAPPROVAL_LABEL, status: "active" }]);
    expect(supportedBadgeTypes).not.toContain("TEST_PRE_APPROVED");
    expect(marked.badges.filter((badge) => badge.type === "PRE_APPROVED")).toHaveLength(0);
  });
  it("never counts test or demo preview labels as verification", () => {
    expect(hasVerifiedPreviewBadge([])).toBe(false);
    expect(hasVerifiedPreviewBadge([TEST_PREAPPROVAL_LABEL])).toBe(false);
    expect(hasVerifiedPreviewBadge(["Demo buyer", TEST_PREAPPROVAL_LABEL])).toBe(false);
    expect(hasVerifiedPreviewBadge([TEST_PREAPPROVAL_LABEL, "Pre-approved"])).toBe(true);
  });
});
