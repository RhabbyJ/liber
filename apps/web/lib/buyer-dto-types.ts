import type { Badge, BuyerCriteriaDetail } from "./mock-data";

export type SafeBadgeDto = {
  expiresInDays?: number;
  label: string;
  status: "active";
  type: Badge["type"];
};

export type SafeCriteriaDto = Omit<BuyerCriteriaDetail, "id" | "priceMax" | "priceMin">;

export type PublicBuyerPreviewDto = {
  amenities: string[];
  area: string;
  badges: string[];
  bathroomsMin?: number;
  bedroomsMin?: number;
  budgetLabel: string;
  condition?: string;
  label: string;
  pin?: {
    latitude: number;
    longitude: number;
  };
  squareFeetMin?: number;
};

export type SellerBuyerSearchDto = {
  alias: string;
  avatarVariant?: string;
  badges: SafeBadgeDto[];
  budgetMax: number;
  budgetMin: number;
  buyerProfileId: string;
  canInvite: boolean;
  criteria: SafeCriteriaDto[];
  downPaymentMax: number;
  downPaymentMin: number;
  location: string;
  mapPoint: {
    latitude: number;
    longitude: number;
  };
  propertyType: string;
  purchaseType: string;
  refreshedAt: string;
};

export type SellerBuyerSearchResponseDto = {
  buyers: SellerBuyerSearchDto[];
};

export type SellerBuyerProfileDto = {
  alias: string;
  avatarVariant?: string;
  badges: SafeBadgeDto[];
  budgetMax: number;
  budgetMin: number;
  buyerProfileId: string;
  downPaymentMax: number;
  downPaymentMin: number;
  location: string;
  needs: string[];
  propertyType: string;
  purchaseType: string;
  viewerCanInvite: boolean;
  viewerIsOwner: boolean;
  wants: string[];
};
