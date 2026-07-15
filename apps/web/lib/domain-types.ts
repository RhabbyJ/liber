import type { PropertySubtype } from "./property-types";

export type Badge = {
  id: string;
  type:
    | "PRE_APPROVED"
    | "EARNEST_MONEY_DEPOSITED"
    | "CASH_BUYER"
    | "NON_CONTINGENT"
    | "VERIFIED_IDENTITY"
    | "VERIFIED_FUNDS"
    | "COMPLETED_TRANSACTION";
  label: string;
  status: "active" | "pending" | "expired";
  expiresInDays?: number;
};

export type BuyerCriteriaDetail = {
  id?: string;
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

export type Buyer = {
  id: string;
  avatarVariant?: string;
  userId?: string;
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
  badges: Badge[];
  criteria: string[];
  criteriaDetails: BuyerCriteriaDetail[];
  propertySubtypes: PropertySubtype[];
  refreshedAt: string;
  primaryServiceArea?: {
    active?: boolean;
    center: { lat: number; lng: number };
    id: string;
    marketSlug: string;
    slug: string;
  };
  serviceAreaSlugs?: string[];
  lat: number;
  lng: number;
};

export type PropertyVerificationStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

export type Property = {
  id: string;
  ownerUserId: string;
  title: string;
  location: string;
  price: number;
  beds?: number;
  baths?: number;
  area?: number;
  lotSize?: number;
  garageArea?: number;
  propertyType: PropertySubtype;
  condition: string;
  features: string[];
  description: string;
  ownershipVerificationStatus: PropertyVerificationStatus;
  status: string;
};
