import type { PropertySubtype } from "./property-types";

export type SellerPropertyDTO = {
  id: string;
  title: string;
  location: string;
  price: number;
  beds?: number;
  baths?: number;
  area?: number;
  lotSize?: number;
  propertyType: PropertySubtype;
  condition: string;
  features: string[];
  description: string;
  status: string;
  lifecycleStatus: "DRAFT" | "READY_FOR_REVIEW" | "READY_FOR_INVITES" | "ARCHIVED";
  identityVersion: number;
  /** Owner-only: first uploaded photo of the current property identity, read through the image access route. */
  coverImageId?: string;
};

export type InviteDTO = {
  id: string;
  buyerProfileId: string;
  propertyId: string;
  /** Picks a representative photo when the seller has not shared property images. */
  propertyType?: PropertySubtype;
  buyer: string;
  property: string;
  propertyStatus?: string;
  propertyCondition?: string;
  propertyFeatures?: string[];
  /** Current-identity listing facts and the seller's note, shared only with the invited buyer. */
  propertyPrice?: number;
  propertyBedrooms?: number;
  propertyBathrooms?: number;
  propertySquareFeet?: number;
  propertyNote?: string;
  status: "Sent" | "Viewed" | "Accepted" | "Declined" | "Expired";
  sentAt: string;
  sentAtDate: string;
  expiresAt?: string;
  title: string;
  message: string;
  imageIds?: string[];
  conversationAvailable?: boolean;
  conversationId?: string;
};
