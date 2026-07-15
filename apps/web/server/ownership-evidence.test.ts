import { describe, expect, it } from "vitest";
import {
  ownershipEvidenceKindForInput,
  verificationDocumentTypeLabel,
} from "./ownership-evidence";

describe("seller ownership evidence", () => {
  it("validates ownership evidence kind input and labels admin document rows", () => {
    expect(ownershipEvidenceKindForInput("GOVERNMENT_ID")).toBe("GOVERNMENT_ID");
    expect(() => ownershipEvidenceKindForInput("DEED")).toThrow("Unsupported ownership evidence type.");
    expect(verificationDocumentTypeLabel("OWNERSHIP", "PROPERTY_ADDRESS_PROOF")).toBe(
      "Ownership: utility, tax, or mortgage bill",
    );
  });
});
