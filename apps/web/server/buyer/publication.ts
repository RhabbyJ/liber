import type { Prisma } from "@liber/db";

/** Stored fields that decide whether a buyer profile may be ACTIVE (seller-visible). */
export const publicationFieldsSelect = {
  budgetMax: true,
  budgetMin: true,
  buyerType: true,
  buyingPurpose: true,
  criteria: { select: { id: true } },
  desiredServiceAreas: {
    select: {
      isPrimary: true,
      source: true,
      serviceArea: { select: { active: true, market: { select: { active: true } } } },
    },
  },
} satisfies Prisma.BuyerProfileSelect;

type PublicationFields = {
  budgetMax: unknown;
  budgetMin: unknown;
  buyerType: string | null;
  buyingPurpose: string | null;
  criteria: unknown[];
  desiredServiceAreas: Array<{
    isPrimary: boolean;
    source: string;
    serviceArea: { active: boolean; market: { active: boolean } };
  }>;
};

/**
 * The first rule a saved profile breaks for publication, or null when it can go
 * live as stored. Mirrors the form-time publication checks plus the database
 * activation constraints (one criteria row and one active, buyer-selected area).
 */
export function publicationGap(profile: PublicationFields): string | null {
  if (!profile.buyerType || !profile.buyingPurpose) {
    return "Purchase type and seeking property type are required before publishing.";
  }
  if (profile.budgetMin === null || profile.budgetMin === undefined || profile.budgetMax === null || profile.budgetMax === undefined) {
    return "Budget range is required before publishing.";
  }
  const selected = profile.desiredServiceAreas.filter((area) => area.isPrimary && area.source === "SELECTED");
  if (selected.length !== 1 || !selected[0].serviceArea.active || !selected[0].serviceArea.market.active) {
    return "Choose an active Liber service area before publishing your profile.";
  }
  if (profile.criteria.length !== 1) return "Buyer criteria are required before publishing.";
  return null;
}
