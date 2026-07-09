export const ownershipEvidenceKinds = ["GOVERNMENT_ID", "PROPERTY_ADDRESS_PROOF"] as const;
export const requiredOwnershipEvidenceKinds = ownershipEvidenceKinds;

export type OwnershipEvidenceKind = (typeof ownershipEvidenceKinds)[number];
export type OwnershipReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export function ownershipEvidenceKindForInput(value: unknown): OwnershipEvidenceKind {
  if (typeof value === "string" && ownershipEvidenceKinds.includes(value as OwnershipEvidenceKind)) {
    return value as OwnershipEvidenceKind;
  }
  throw new Error("Unsupported ownership evidence type.");
}

export function ownershipEvidenceKindLabel(value?: string | null) {
  if (value === "GOVERNMENT_ID") return "government-issued photo ID";
  if (value === "PROPERTY_ADDRESS_PROOF") return "utility, tax, or mortgage bill";
  return "ownership document";
}

export function verificationDocumentTypeLabel(documentType: string, ownershipEvidenceKind?: string | null) {
  if (documentType === "OWNERSHIP") return `Ownership: ${ownershipEvidenceKindLabel(ownershipEvidenceKind)}`;
  if (documentType === "PRE_APPROVAL") return "Pre-approval letter";
  if (documentType === "VERIFIED_FUNDS") return "Proof of funds";
  if (documentType === "IDENTITY") return "Identity";
  return "Other";
}

export function nextOwnershipVerificationStatus(
  documents: Array<{ ownershipEvidenceKind?: string | null; reviewStatus: string }>,
  fallbackDecision: OwnershipReviewStatus,
): OwnershipReviewStatus {
  const kindedDocuments = documents.filter((document) => document.ownershipEvidenceKind);
  if (kindedDocuments.length === 0) return fallbackDecision;

  const statusesForKind = (kind: OwnershipEvidenceKind) =>
    kindedDocuments
      .filter((document) => document.ownershipEvidenceKind === kind)
      .map((document) => document.reviewStatus);
  const allRequiredKindsApproved = requiredOwnershipEvidenceKinds.every((kind) =>
    statusesForKind(kind).includes("APPROVED"),
  );
  if (allRequiredKindsApproved) return "APPROVED";

  const anyRequiredKindPending = requiredOwnershipEvidenceKinds.some((kind) =>
    statusesForKind(kind).includes("PENDING"),
  );
  if (anyRequiredKindPending) return "PENDING";

  const anyRequiredKindOnlyRejected = requiredOwnershipEvidenceKinds.some((kind) => {
    const statuses = statusesForKind(kind);
    return statuses.length > 0 && statuses.every((status) => status === "REJECTED");
  });
  return anyRequiredKindOnlyRejected ? "REJECTED" : "PENDING";
}
