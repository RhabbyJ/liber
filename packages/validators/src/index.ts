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

// V1 keeps a broad HOME category while subtypes mirror buyer/seller property choices.
export const propertyCategorySchema = z.enum(["HOME"]);

export const propertySubtypeValues = ["HOME", "CONDO", "TOWNHOUSE", "MANUFACTURED", "LAND"] as const;

export const propertySubtypeSchema = z.enum(propertySubtypeValues);

export const purchaseTypeSchema = z.enum(["Cash", "Conventional financing", "Other"]);

export const seekingPropertyTypeSchema = z.enum(["House", "Condo", "Townhouse", "Manufactured", "Land"]);

export const buyingPurposeSchema = seekingPropertyTypeSchema;

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
const clearedSnapshotValue = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;
const snapshotMoney = z.preprocess(
  clearedSnapshotValue,
  z.coerce.number().min(0).nullable(),
);
const snapshotInteger = z.preprocess(
  clearedSnapshotValue,
  z.coerce.number().int().min(0).nullable(),
);
const snapshotText = (max: number) => z.preprocess(
  clearedSnapshotValue,
  z.string().trim().max(max).nullable(),
);
export const marketSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const serviceAreaSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

export const publishBuyerProfileSchema = z.object({
  bathroomsMin: snapshotInteger,
  bedroomsMin: snapshotInteger,
  bio: snapshotText(1200),
  budgetMax: snapshotMoney,
  budgetMin: snapshotMoney,
  buyerType: purchaseTypeSchema,
  buyingPurpose: buyingPurposeSchema,
  condition: snapshotText(80),
  desiredMarketSlug: marketSlugSchema,
  desiredServiceAreaSlug: serviceAreaSlugSchema,
  downPaymentMax: snapshotMoney,
  downPaymentMin: snapshotMoney,
  features: z.array(z.string().trim().min(1).max(80)).default([]),
  lotSizeMax: snapshotInteger,
  lotSizeMin: snapshotInteger,
  squareFeetMax: snapshotInteger,
  squareFeetMin: snapshotInteger,
  yearBuiltMin: snapshotInteger,
}).refine(
  (input) => input.budgetMin === null || input.budgetMax === null || input.budgetMin <= input.budgetMax,
  { message: "Budget minimum cannot exceed budget maximum.", path: ["budgetMin"] },
).refine(
  (input) => input.downPaymentMin === null || input.downPaymentMax === null || input.downPaymentMin <= input.downPaymentMax,
  { message: "Down payment minimum cannot exceed down payment maximum.", path: ["downPaymentMin"] },
).refine(
  (input) => input.squareFeetMin === null || input.squareFeetMax === null || input.squareFeetMin <= input.squareFeetMax,
  { message: "Square feet minimum cannot exceed square feet maximum.", path: ["squareFeetMin"] },
).refine(
  (input) => input.lotSizeMin === null || input.lotSizeMax === null || input.lotSizeMin <= input.lotSizeMax,
  { message: "Lot size minimum cannot exceed lot size maximum.", path: ["lotSizeMin"] },
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
  market: marketSlugSchema,
  serviceArea: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  propertyCategory: propertyCategorySchema.optional(),
  propertySubtype: propertySubtypeSchema.optional(),
  budgetMin: optionalMoney,
  budgetMax: optionalMoney,
  bedrooms: optionalInteger,
  bathrooms: optionalInteger,
  squareFeet: optionalInteger,
  lotSize: optionalInteger,
  condition: z.enum(["Move-in ready", "Mild fixer", "Fixer"]).optional(),
  amenities: z.array(z.enum(["Pool", "Parking", "ADU", "Yard", "Garage"])).max(5).default([]),
  badges: z.array(badgeTypeSchema).default([]),
  cursor: z.string().trim().min(1).max(2048).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum([
    "recommended",
    "recently_active",
    "highest_budget",
    "most_verified",
  ]).default("recommended"),
}).refine(
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

export type PublishBuyerProfileInput = z.infer<typeof publishBuyerProfileSchema>;
export type CreateSellerPropertyInput = z.infer<typeof createSellerPropertySchema>;
export type UpdateSellerPropertyInput = z.infer<typeof updateSellerPropertySchema>;
export type SendInviteInput = z.infer<typeof sendInviteSchema>;
export type SearchBuyersInput = z.infer<typeof searchBuyersSchema>;
export type SellerAccessReviewInput = z.infer<typeof sellerAccessReviewSchema>;
