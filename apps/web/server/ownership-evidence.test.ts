import { describe, expect, it } from "vitest";
import {
  nextOwnershipVerificationStatus,
  ownershipEvidenceKindForInput,
  verificationDocumentTypeLabel,
} from "./ownership-evidence";

describe("seller ownership evidence", () => {
  it("requires both ownership evidence kinds before approval", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", reviewStatus: "APPROVED" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", reviewStatus: "PENDING" },
    ], "APPROVED")).toBe("PENDING");

    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", reviewStatus: "APPROVED" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", reviewStatus: "APPROVED" },
    ], "APPROVED")).toBe("APPROVED");
  });

  it("allows approved replacement evidence to recover from an earlier rejection", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: "GOVERNMENT_ID", reviewStatus: "REJECTED" },
      { ownershipEvidenceKind: "GOVERNMENT_ID", reviewStatus: "APPROVED" },
      { ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", reviewStatus: "APPROVED" },
    ], "APPROVED")).toBe("APPROVED");
  });

  it("keeps old generic ownership documents compatible", () => {
    expect(nextOwnershipVerificationStatus([
      { ownershipEvidenceKind: null, reviewStatus: "APPROVED" },
    ], "APPROVED")).toBe("APPROVED");
  });

  it("validates ownership evidence kind input and labels admin document rows", () => {
    expect(ownershipEvidenceKindForInput("GOVERNMENT_ID")).toBe("GOVERNMENT_ID");
    expect(() => ownershipEvidenceKindForInput("DEED")).toThrow("Unsupported ownership evidence type.");
    expect(verificationDocumentTypeLabel("OWNERSHIP", "PROPERTY_ADDRESS_PROOF")).toBe(
      "Ownership: utility, tax, or mortgage bill",
    );
  });
});
