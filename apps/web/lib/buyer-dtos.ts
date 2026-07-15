import type { PropertySubtype } from "./property-types";

type SupportedBadgeType = "PRE_APPROVED" | "VERIFIED_IDENTITY" | "VERIFIED_FUNDS";

export type SellerBadgeDTO = {
  type: SupportedBadgeType | "CASH_BUYER";
  label: string;
  status: "active";
  expiresInDays?: number;
};
export type SellerBuyerCriteriaDTO = {
  propertyCategory: "HOME";
  propertySubtype: PropertySubtype;
  bedroomsMin?: number;
  bathroomsMin?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  lotSizeMin?: number;
  lotSizeMax?: number;
  priceMin?: number;
  priceMax?: number;
  yearBuiltMin?: number;
  condition?: string;
  features?: string[];
};

export type SellerBuyerSummaryDTO = {
  id: string;
  isDemo: boolean;
  avatarSeed: string;
  avatarVariant?: string;
  name: string;
  location: string;
  city: string;
  neighborhood?: string;
  postalCode?: string;
  state: string;
  type: string;
  purpose: string;
  visibility: "active";
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  bio: string;
  needs: string[];
  wants: string[];
  badges: SellerBadgeDTO[];
  criteria: string[];
  criteriaDetails: SellerBuyerCriteriaDTO[];
  propertySubtypes: PropertySubtype[];
  refreshedAt: string;
  marketSlug: string;
  serviceAreaSlug: string;
  lat: number;
  lng: number;
  canInvite: boolean;
};

export type SellerBuyerDetailDTO = SellerBuyerSummaryDTO;

export type OwnerBadgeDTO = {
  id: string;
  type: string;
  label: string;
  status: "active" | "pending" | "expired";
  expiresInDays?: number;
};

export type OwnerBuyerProfileDTO = {
  id: string;
  avatarVariant?: string;
  userId: string;
  name: string;
  location: string;
  city: string;
  neighborhood?: string;
  postalCode?: string;
  state: string;
  type: string;
  purpose: string;
  visibility: "active" | "draft" | "hidden";
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  bio: string;
  needs: string[];
  wants: string[];
  badges: OwnerBadgeDTO[];
  criteria: string[];
  criteriaDetails: SellerBuyerCriteriaDTO[];
  propertySubtypes: PropertySubtype[];
  refreshedAt: string;
  primaryServiceArea?: {
    active: boolean;
    center: { lat: number; lng: number };
    id: string;
    marketSlug: string;
    slug: string;
  };
  serviceAreaSlugs: string[];
  lat: number;
  lng: number;
  accountName?: string;
};
