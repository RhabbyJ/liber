const ownershipEvidenceKinds = ["GOVERNMENT_ID", "PROPERTY_ADDRESS_PROOF"] as const;

export type OwnershipEvidenceKind = (typeof ownershipEvidenceKinds)[number];

export function ownershipEvidenceKindForInput(value: unknown): OwnershipEvidenceKind {
  if (typeof value === "string" && ownershipEvidenceKinds.includes(value as OwnershipEvidenceKind)) {
    return value as OwnershipEvidenceKind;
  }
  throw new Error("Unsupported ownership evidence type.");
}

function ownershipEvidenceKindLabel(value?: string | null) {
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
