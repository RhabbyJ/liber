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
