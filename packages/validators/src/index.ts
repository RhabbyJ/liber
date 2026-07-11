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

// V1 keeps a broad HOME category while subtypes mirror buyer/seller property choices.
export const propertyCategorySchema = z.enum(["HOME"]);

export const propertySubtypeValues = ["HOME", "CONDO", "TOWNHOUSE", "MANUFACTURED", "LAND"] as const;

export const propertySubtypeSchema = z.enum(propertySubtypeValues);

export const purchaseTypeSchema = z.enum(["Cash", "Conventional financing", "Other"]);

export const seekingPropertyTypeSchema = z.enum(["House", "Condo", "Townhouse", "Manufactured", "Land"]);

export const buyingPurposeSchema = seekingPropertyTypeSchema;

export const badgeTypeSchema = z.enum([
  "PRE_APPROVED",
  "CASH_BUYER",
  "VERIFIED_IDENTITY",
  "VERIFIED_FUNDS",
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
export const marketSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const nullableServiceAreaSlug = z.union([
  z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  z.null(),
]).optional();

const buyerProfileShape = {
  buyerType: purchaseTypeSchema.optional(),
  bio: z.string().trim().max(1200).optional(),
  buyingPurpose: buyingPurposeSchema.optional(),
  desiredMarketSlug: marketSlugSchema.optional(),
  desiredServiceAreaSlug: nullableServiceAreaSlug,
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
).superRefine((input, context) => {
  if (typeof input.desiredServiceAreaSlug === "string" && !input.desiredMarketSlug) {
    context.addIssue({
      code: "custom",
      message: "A market is required for the selected service area.",
      path: ["desiredMarketSlug"],
    });
  }
});

export const updateBuyerProfileSchema = z.object({
  ...buyerProfileShape,
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
).superRefine((input, context) => {
  if (typeof input.desiredServiceAreaSlug === "string" && !input.desiredMarketSlug) {
    context.addIssue({
      code: "custom",
      message: "A market is required for the selected service area.",
      path: ["desiredMarketSlug"],
    });
  }
});

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
  providerPropertyId: z.string().trim().min(1).max(160).optional(),
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
  ownershipConfirmed: z.literal(true),
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
  identityMatchesOwner: z.boolean().optional(),
  authorityConfirmed: z.boolean().optional(),
  addressMatchesProperty: z.boolean().optional(),
  ownerOrEntityMatches: z.boolean().optional(),
});

export const grantBadgeSchema = z.object({
  buyerProfileId: z.string().min(1),
  badgeType: z.enum(["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"]),
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

export const createUploadSessionSchema = z.object({
  purpose: z.enum(["BUYER_VERIFICATION", "PROPERTY_IMAGE", "PROPERTY_OWNERSHIP"]),
  propertyId: z.string().min(1).max(200).optional(),
  documentType: z.enum(["PRE_APPROVAL", "VERIFIED_FUNDS", "IDENTITY"]).optional(),
  ownershipEvidenceKind: z.enum(["GOVERNMENT_ID", "PROPERTY_ADDRESS_PROOF"]).optional(),
  filename: z.string().trim().min(1).max(255).refine((value) => !/[\\/]/.test(value), "Filename must not contain a path."),
  sizeBytes: z.number().int().positive().max(20 * 1_048_576),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
}).superRefine((input, context) => {
  if (input.purpose === "PROPERTY_IMAGE") {
    if (!input.propertyId) context.addIssue({ code: "custom", message: "Property is required.", path: ["propertyId"] });
    if (input.mimeType === "application/pdf") context.addIssue({ code: "custom", message: "Property images must be PNG, JPG, or WebP.", path: ["mimeType"] });
    if (input.sizeBytes > 10 * 1_048_576) context.addIssue({ code: "custom", message: "Property images must be 10 MB or smaller.", path: ["sizeBytes"] });
  }
  if (input.purpose === "PROPERTY_OWNERSHIP") {
    if (!input.propertyId) context.addIssue({ code: "custom", message: "Property is required.", path: ["propertyId"] });
    if (!input.ownershipEvidenceKind) context.addIssue({ code: "custom", message: "Ownership evidence kind is required.", path: ["ownershipEvidenceKind"] });
  }
  if (input.purpose === "BUYER_VERIFICATION" && !input.documentType) {
    context.addIssue({ code: "custom", message: "Document type is required.", path: ["documentType"] });
  }
});

export const finalizeUploadSessionSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export type CreateBuyerProfileInput = z.infer<typeof createBuyerProfileSchema>;
export type UpdateBuyerProfileInput = z.infer<typeof updateBuyerProfileSchema>;
export type UpsertBuyerCriteriaInput = z.infer<typeof upsertBuyerCriteriaSchema>;
export type CreateSellerPropertyInput = z.infer<typeof createSellerPropertySchema>;
export type UpdateSellerPropertyInput = z.infer<typeof updateSellerPropertySchema>;
export type SendInviteInput = z.infer<typeof sendInviteSchema>;
export type SearchBuyersInput = z.infer<typeof searchBuyersSchema>;
export type SellerAccessReviewInput = z.infer<typeof sellerAccessReviewSchema>;
export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;
