import type { Badge, BuyerCriteriaDetail } from "./domain-types";

export type SafeBadgeDto = {
  expiresInDays?: number;
  label: string;
  status: "active";
  type: Badge["type"];
};

export type SafeCriteriaDto = Omit<BuyerCriteriaDetail, "id" | "priceMax" | "priceMin">;

export type PublicBuyerPreviewDto = {
  alias: string;
  amenities: string[];
  area: string;
  avatarVariant: string;
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
  items: SellerBuyerSearchDto[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
    pageSize: number;
    snapshotAt: string;
  };
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
