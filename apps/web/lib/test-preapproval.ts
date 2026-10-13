import type { OwnerBuyerProfileDTO, SellerBuyerSummaryDTO } from "./buyer-dtos";

export const TEST_PREAPPROVAL_LABEL = "Test pre-approval — not verified";

// Public preview labels for synthetic/test state; they never count as verification.
const UNVERIFIED_PREVIEW_LABELS = new Set(["Demo buyer", TEST_PREAPPROVAL_LABEL]);

export function hasVerifiedPreviewBadge(labels: string[]) {
  return labels.some((label) => !UNVERIFIED_PREVIEW_LABELS.has(label));
}

export function withOwnerTestPreapproval<T extends OwnerBuyerProfileDTO>(buyer: T, activeIds: Set<string>): T {
  if (!activeIds.has(buyer.id)) return buyer;
  return { ...buyer, badges: [...buyer.badges, { id: `test-preapproval:${buyer.id}`, type: "TEST_PRE_APPROVED", label: TEST_PREAPPROVAL_LABEL, status: "active" }] };
}

export function withSellerTestPreapproval<T extends SellerBuyerSummaryDTO>(buyer: T, activeIds: Set<string>): T {
  if (!activeIds.has(buyer.id)) return buyer;
  return { ...buyer, badges: [...buyer.badges, { type: "TEST_PRE_APPROVED", label: TEST_PREAPPROVAL_LABEL, status: "active" }] };
}

export type SelfTestPreapprovalState = {
  enabled: boolean;
  hasBuyerRole: boolean;
  buyerProfileId: string | null;
  active: boolean;
};

export type TestPreapprovalResult = { ok: boolean; message: string };
