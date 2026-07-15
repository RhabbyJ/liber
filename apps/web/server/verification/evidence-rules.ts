const badgeEvidenceRules = {
  PRE_APPROVED: ["PRE_APPROVAL"],
  VERIFIED_FUNDS: ["VERIFIED_FUNDS"],
  VERIFIED_IDENTITY: ["IDENTITY"],
} as const;

export type EvidenceBackedBadgeType = keyof typeof badgeEvidenceRules;

export function evidenceSupportsBadge(badgeType: EvidenceBackedBadgeType, documentType: string) {
  return (badgeEvidenceRules[badgeType] as readonly string[]).includes(documentType);
}
