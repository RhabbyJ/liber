import { z } from "zod";

export const userRoleSchema = z.enum(["BUYER", "SELLER", "ADMIN"]);

export const sellerAccessStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);

export const buyerVisibilityStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "HIDDEN",
  "SUSPENDED",
]);

export const buyerSelfVisibilityStatusSchema = z.enum(["DRAFT", "ACTIVE"]);

// V1 is residential-only; expand alongside the Prisma enums when commercial/land returns.
export const propertyCategorySchema = z.enum(["HOME"]);

export const propertySubtypeSchema = z.enum(["HOME"]);

export const buyingPurposeSchema = z.enum(["Owner occupy", "Fix and flip", "Other"]);

export const badgeTypeSchema = z.enum([
  "PRE_APPROVED",
  "EARNEST_MONEY_DEPOSITED",
  "CASH_BUYER",
  "NON_CONTINGENT",
  "VERIFIED_IDENTITY",
  "VERIFIED_FUNDS",
  "COMPLETED_TRANSACTION",
]);

export const inviteStatusSchema = z.enum([
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
]);

const optionalMoney = z.coerce.number().min(0).optional();
const optionalInteger = z.coerce.number().int().min(0).optional();

const buyerProfileShape = {
  displayName: z.string().trim().min(1).max(120),
  buyerType: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(1200).optional(),
  buyingPurpose: buyingPurposeSchema.optional(),
  desiredLocationText: z.string().trim().max(160).optional(),
  desiredCity: z.string().trim().max(80).optional(),
  desiredState: z.string().trim().length(2).optional(),
  desiredLat: z.coerce.number().min(-90).max(90).optional(),
  desiredLng: z.coerce.number().min(-180).max(180).optional(),
  budgetMin: optionalMoney,
  budgetMax: optionalMoney,
  downPaymentMin: optionalMoney,
  downPaymentMax: optionalMoney,
  visibilityStatus: buyerSelfVisibilityStatusSchema.optional(),
};

function minDoesNotExceedMax<T extends Record<string, unknown>>(input: T, minKey: keyof T, maxKey: keyof T) {
  return (
    input[minKey] === undefined ||
    input[maxKey] === undefined ||
    Number(input[minKey]) <= Number(input[maxKey])
  );
}

export const createBuyerProfileSchema = z.object({
  ...buyerProfileShape,
  displayName: buyerProfileShape.displayName.optional(),
  visibilityStatus: buyerSelfVisibilityStatusSchema.default("DRAFT"),
}).refine(
  (input) =>
    input.budgetMin === undefined ||
    input.budgetMax === undefined ||
    input.budgetMin <= input.budgetMax,
  {
    message: "Budget minimum cannot exceed budget maximum.",
    path: ["budgetMin"],
  },
).refine(
  (input) =>
    input.downPaymentMin === undefined ||
    input.downPaymentMax === undefined ||
    input.downPaymentMin <= input.downPaymentMax,
  {
    message: "Down payment minimum cannot exceed down payment maximum.",
    path: ["downPaymentMin"],
  },
);

export const updateBuyerProfileSchema = z.object({
  ...buyerProfileShape,
  displayName: buyerProfileShape.displayName.optional(),
}).refine(
  (input) =>
    input.budgetMin === undefined ||
    input.budgetMax === undefined ||
    input.budgetMin <= input.budgetMax,
  {
    message: "Budget minimum cannot exceed budget maximum.",
    path: ["budgetMin"],
  },
).refine(
  (input) =>
    input.downPaymentMin === undefined ||
    input.downPaymentMax === undefined ||
    input.downPaymentMin <= input.downPaymentMax,
  {
    message: "Down payment minimum cannot exceed down payment maximum.",
    path: ["downPaymentMin"],
  },
);

export const upsertBuyerCriteriaSchema = z.object({
  id: z.string().optional(),
  buyerProfileId: z.string().min(1),
  propertyCategory: propertyCategorySchema.default("HOME"),
  propertySubtype: propertySubtypeSchema,
  priceMin: optionalMoney,
  priceMax: optionalMoney,
  squareFeetMin: optionalInteger,
  squareFeetMax: optionalInteger,
  lotSizeMin: optionalInteger,
  lotSizeMax: optionalInteger,
  bedroomsMin: optionalInteger,
  bathroomsMin: optionalInteger,
  yearBuiltMin: optionalInteger,
  condition: z.string().trim().max(80).optional(),
  features: z.array(z.string().trim().min(1).max(80)).default([]),
}).refine(
  (input) => minDoesNotExceedMax(input, "priceMin", "priceMax"),
  {
    message: "Price minimum cannot exceed price maximum.",
    path: ["priceMin"],
  },
).refine(
  (input) => minDoesNotExceedMax(input, "squareFeetMin", "squareFeetMax"),
  {
    message: "Square feet minimum cannot exceed square feet maximum.",
    path: ["squareFeetMin"],
  },
).refine(
  (input) => minDoesNotExceedMax(input, "lotSizeMin", "lotSizeMax"),
  {
    message: "Lot size minimum cannot exceed lot size maximum.",
    path: ["lotSizeMin"],
  },
);

export const createSellerPropertySchema = z.object({
  addressLine1: z.string().trim().max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().length(2).optional(),
  zip: z.string().trim().max(16).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  propertyType: propertySubtypeSchema,
  bedrooms: optionalInteger,
  bathrooms: optionalInteger,
  garageArea: optionalInteger,
  squareFeet: optionalInteger,
  lotSize: optionalInteger,
  condition: z.string().trim().max(80).optional(),
  features: z.array(z.string().trim().min(1).max(80)).default([]),
  description: z.string().trim().max(2000).optional(),
  price: optionalMoney,
  // Sellers must confirm ownership/authority before a property can back invites.
  ownershipConfirmed: z.literal(true),
});

export const updateSellerPropertySchema = createSellerPropertySchema.partial().extend({
  propertyId: z.string().min(1),
});

export const sendInviteSchema = z.object({
  buyerProfileId: z.string().min(1),
  propertyId: z.string().min(1),
  title: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(2000),
  termsAccepted: z.literal(true),
});

export const searchBuyersSchema = z.object({
  city: z.string().trim().max(80).optional(),
  centerLat: z.coerce.number().min(-90).max(90).optional(),
  centerLng: z.coerce.number().min(-180).max(180).optional(),
  state: z.string().trim().length(2).optional(),
  radiusMiles: z.coerce.number().min(1).max(100).optional(),
  propertyCategory: propertyCategorySchema.optional(),
  propertySubtype: propertySubtypeSchema.optional(),
  budgetMin: optionalMoney,
  budgetMax: optionalMoney,
  bedrooms: optionalInteger,
  bathrooms: optionalInteger,
  squareFeet: optionalInteger,
  lotSize: optionalInteger,
  condition: z.string().trim().max(80).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).default([]),
  badges: z.array(badgeTypeSchema).default([]),
  sort: z.enum([
    "recommended",
    "recently_active",
    "highest_budget",
    "most_verified",
  ]).default("recommended"),
}).refine(
  (input) =>
    input.radiusMiles === undefined ||
    (input.centerLat !== undefined && input.centerLng !== undefined),
  {
    message: "Radius search requires latitude and longitude.",
    path: ["radiusMiles"],
  },
).refine(
  (input) =>
    input.budgetMin === undefined ||
    input.budgetMax === undefined ||
    input.budgetMin <= input.budgetMax,
  {
    message: "Budget minimum cannot exceed budget maximum.",
    path: ["budgetMin"],
  },
);

export const reviewDocumentSchema = z.object({
  documentId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

export const grantBadgeSchema = z.object({
  buyerProfileId: z.string().min(1),
  badgeType: badgeTypeSchema,
  evidenceDocumentId: z.string().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const revokeBadgeSchema = z.object({
  badgeId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export const profileVisibilitySchema = z.object({
  visibilityStatus: buyerSelfVisibilityStatusSchema,
});

export const userModerationSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const sellerAccessReviewSchema = z.object({
  userId: z.string().min(1),
  status: sellerAccessStatusSchema,
  notes: z.string().trim().max(500).optional(),
});

export const buyerProfileModerationSchema = z.object({
  buyerProfileId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const respondToInviteSchema = z.object({
  inviteId: z.string().min(1),
  response: z.enum(["ACCEPTED", "DECLINED"]),
});

export type CreateBuyerProfileInput = z.infer<typeof createBuyerProfileSchema>;
export type UpdateBuyerProfileInput = z.infer<typeof updateBuyerProfileSchema>;
export type UpsertBuyerCriteriaInput = z.infer<typeof upsertBuyerCriteriaSchema>;
export type CreateSellerPropertyInput = z.infer<typeof createSellerPropertySchema>;
export type UpdateSellerPropertyInput = z.infer<typeof updateSellerPropertySchema>;
export type SendInviteInput = z.infer<typeof sendInviteSchema>;
export type SearchBuyersInput = z.infer<typeof searchBuyersSchema>;
export type SellerAccessReviewInput = z.infer<typeof sellerAccessReviewSchema>;
