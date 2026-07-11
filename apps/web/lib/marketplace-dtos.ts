import type { PropertySubtype } from "./property-types";

export type SellerPropertyDTO = {
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
  status: string;
  lifecycleStatus: "DRAFT" | "READY_FOR_REVIEW" | "READY_FOR_INVITES" | "ARCHIVED";
  identityVersion: number;
};

export type InviteDTO = {
  id: string;
  sellerId: string;
  buyerProfileId: string;
  propertyId: string;
  buyer: string;
  property: string;
  propertyStatus?: string;
  status: "Sent" | "Viewed" | "Accepted" | "Declined" | "Expired";
  sentAt: string;
  sentAtDate: string;
  expiresAt?: string;
  title: string;
  message: string;
  imageIds?: string[];
};
