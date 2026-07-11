import { describe, expect, it } from "vitest";
import {
  assertOwnershipEvidenceApprovalAllowed,
  isOwnershipEvidenceAuditOnly,
  isOwnershipEvidenceStale,
  nextOwnershipVerificationStatus,
  ownershipEvidenceKindForInput,
  verificationDocumentTypeLabel,
} from "./ownership-evidence";

describe("seller ownership evidence", () => {
  it("requires both ownership evidence kinds before approval", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 2, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: 2, reviewStatus: "PENDING", userId: "seller-1" },
    ], 2, "seller-1")).toBe("PENDING");

    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 2, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: 2, reviewStatus: "APPROVED", userId: "seller-1" },
    ], 2, "seller-1")).toBe("APPROVED");
  });

  it("allows approved replacement evidence to recover from an earlier rejection", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 3, reviewStatus: "REJECTED", userId: "seller-1" },
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 3, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: 3, reviewStatus: "APPROVED", userId: "seller-1" },
    ], 3, "seller-1")).toBe("APPROVED");
  });

  it("requires all unbound legacy ownership evidence to be re-reviewed", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: null, propertyOwnershipVersion: null, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: null, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: null, reviewStatus: "APPROVED", userId: "seller-1" },
    ], 1, "seller-1")).toBe("PENDING");
  });

  it("does not let prior-version or different-owner evidence approve the current property", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 1, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: 1, reviewStatus: "APPROVED", userId: "seller-1" },
      { ownershipEvidenceKind: "GOVERNMENT_ID", propertyOwnershipVersion: 2, reviewStatus: "APPROVED", userId: "other-seller" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", propertyOwnershipVersion: 2, reviewStatus: "APPROVED", userId: "other-seller" },
    ], 2, "seller-1")).toBe("PENDING");
  });

  it("treats null-version legacy evidence as permanently stale and audit-only", () => {
    expect(isOwnershipEvidenceAuditOnly("OWNERSHIP", null)).toBe(true);
    expect(isOwnershipEvidenceStale("OWNERSHIP", null, 3)).toBe(true);
    expect(isOwnershipEvidenceStale("OWNERSHIP", 2, 3)).toBe(true);
    expect(isOwnershipEvidenceStale("OWNERSHIP", 3, 3)).toBe(false);
    expect(isOwnershipEvidenceStale("IDENTITY", null, null)).toBe(false);
  });

  it("allows legacy evidence rejection but never approval or rebinding", () => {
    expect(() => assertOwnershipEvidenceApprovalAllowed(
      "OWNERSHIP",
      "REJECTED",
      null,
      3,
    )).not.toThrow();
    expect(() => assertOwnershipEvidenceApprovalAllowed(
      "OWNERSHIP",
      "APPROVED",
      null,
      3,
    )).toThrow("Legacy ownership evidence is audit-only");
    expect(() => assertOwnershipEvidenceApprovalAllowed(
      "OWNERSHIP",
      "APPROVED",
      2,
      3,
    )).toThrow("previous property version");
    expect(() => assertOwnershipEvidenceApprovalAllowed(
      "OWNERSHIP",
      "APPROVED",
      3,
      3,
    )).not.toThrow();
  });

  it("validates ownership evidence kind input and labels admin document rows", () => {
    expect(ownershipEvidenceKindForInput("GOVERNMENT_ID")).toBe("GOVERNMENT_ID");
    expect(() => ownershipEvidenceKindForInput("DEED")).toThrow("Unsupported ownership evidence type.");
    expect(verificationDocumentTypeLabel("OWNERSHIP", "PROPERTY_ADDRESS_PROOF")).toBe(
      "Ownership: utility, tax, or mortgage bill",
    );
  });
});
