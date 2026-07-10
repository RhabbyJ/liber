import type { PublishBuyerProfileInput } from "@liber/validators";
import { propertySubtypeFromSeekingPropertyType } from "../lib/property-types";

export function buyerProfileSnapshotData(data: PublishBuyerProfileInput) {
  return {
    bio: data.bio,
    budgetMax: data.budgetMax,
    budgetMin: data.budgetMin,
    buyerType: data.buyerType,
    buyingPurpose: data.buyingPurpose,
    downPaymentMax: data.downPaymentMax,
    downPaymentMin: data.downPaymentMin,
  };
}

export function buyerCriteriaSnapshotData(data: PublishBuyerProfileInput) {
  return {
    bathroomsMin: data.bathroomsMin,
    bedroomsMin: data.bedroomsMin,
    condition: data.condition,
    features: data.features,
    lotSizeMax: data.lotSizeMax,
    lotSizeMin: data.lotSizeMin,
    priceMax: data.budgetMax,
    priceMin: data.budgetMin,
    propertyCategory: "HOME" as const,
    propertySubtype: propertySubtypeFromSeekingPropertyType(data.buyingPurpose),
    squareFeetMax: data.squareFeetMax,
    squareFeetMin: data.squareFeetMin,
    yearBuiltMin: data.yearBuiltMin,
  };
}
