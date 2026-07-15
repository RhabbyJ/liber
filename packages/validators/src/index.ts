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

const buyingPurposeSchema = seekingPropertyTypeSchema;

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

export const sellerGuidedMessageTemplateKeyValues = [
  "SELLER_PRIVATE_VIEWING",
  "SELLER_MORE_DETAILS",
  "SELLER_TIMING_AND_PLANS",
  "SELLER_NEXT_STEPS",
] as const;

export const buyerGuidedMessageTemplateKeyValues = [
  "BUYER_SCHEDULE_VIEWING",
  "BUYER_MORE_DETAILS",
  "BUYER_PROPERTY_CONDITION",
  "BUYER_INTERESTED_QUESTIONS",
  "BUYER_NOT_A_FIT",
] as const;

export const guidedMessageTemplateKeyValues = [
  ...sellerGuidedMessageTemplateKeyValues,
  ...buyerGuidedMessageTemplateKeyValues,
] as const;

export const sellerGuidedMessageTemplateKeySchema = z.enum(
  sellerGuidedMessageTemplateKeyValues,
);
export const buyerGuidedMessageTemplateKeySchema = z.enum(
  buyerGuidedMessageTemplateKeyValues,
);
export const guidedMessageTemplateKeySchema = z.enum(
  guidedMessageTemplateKeyValues,
);
export const guidedMessageTemplateVersionSchema = z.literal(1);

export const messageReportCategorySchema = z.enum([
  "HARASSMENT_OR_THREAT",
  "DISCRIMINATORY_CONTENT",
  "FRAUD_OR_SCAM",
  "SPAM",
  "SENSITIVE_INFORMATION_REQUEST",
  "OFF_PLATFORM_PAYMENT_REQUEST",
  "OTHER",
]);

function hasWellFormedUtf16(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizedPlainTextSchema(maxLength: number) {
  return z.string()
    .superRefine((value, context) => {
      if (!hasWellFormedUtf16(value)) {
        context.addIssue({
          code: "custom",
          message: "Text contains malformed Unicode.",
        });
      }
      if (value.includes("\u0000")) {
        context.addIssue({
          code: "custom",
          message: "Text contains an unsupported null character.",
        });
      }
    })
    .transform((value) => value.normalize("NFC").replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().min(1).superRefine((value, context) => {
      if (Array.from(value).length > maxLength) {
        context.addIssue({
          code: "custom",
          message: `Text must contain at most ${maxLength} characters.`,
        });
      }
    }));
}

export const messageBodySchema = normalizedPlainTextSchema(2000);
export const messageNoteSchema = normalizedPlainTextSchema(500);
export const reportDetailsSchema = normalizedPlainTextSchema(2000);
export const moderationResolutionSchema = normalizedPlainTextSchema(2000);
export const optionalMessageNoteSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  messageNoteSchema.optional(),
);

const cuidBackedIdSchema = z.string().trim().min(1).max(200);
export const conversationIdSchema = z.string().trim().uuid();
export const messageIdSchema = z.string().trim().uuid();
export const messageReportIdSchema = z.string().trim().uuid();
export const clientMessageIdSchema = z.string().trim().uuid();

export const conversationRouteParamsSchema = z.object({
  conversationId: conversationIdSchema,
}).strict();

export const messageRouteParamsSchema = z.object({
  messageId: messageIdSchema,
}).strict();

export const messageReportRouteParamsSchema = z.object({
  reportId: messageReportIdSchema,
}).strict();

const guidedMessageSchema = z.object({
  clientMessageId: clientMessageIdSchema,
  kind: z.literal("GUIDED"),
  templateKey: guidedMessageTemplateKeySchema,
  templateVersion: guidedMessageTemplateVersionSchema,
}).strict();

const freeTextMessageSchema = z.object({
  body: messageBodySchema,
  clientMessageId: clientMessageIdSchema,
  kind: z.literal("FREE_TEXT"),
}).strict();

export const sendConversationMessageSchema = z.discriminatedUnion("kind", [
  guidedMessageSchema,
  freeTextMessageSchema,
]);

export const markConversationReadSchema = z.object({
  lastReadMessageId: messageIdSchema,
}).strict();

export const muteConversationSchema = z.object({
  muted: z.boolean(),
}).strict();

export const blockConversationSchema = z.object({
  reason: messageNoteSchema.optional(),
}).strict();

export const reportMessageSchema = z.object({
  block: z.boolean().default(false),
  category: messageReportCategorySchema,
  details: reportDetailsSchema.optional(),
}).strict();

export const resolveMessageReportSchema = z.discriminatedUnion("status", [
  z.object({
    redactMessage: z.literal(false).optional(),
    resolution: z.undefined().optional(),
    status: z.literal("IN_REVIEW"),
  }).strict(),
  z.object({
    redactMessage: z.boolean().optional(),
    resolution: moderationResolutionSchema,
    status: z.literal("ACTIONED"),
  }).strict(),
  z.object({
    redactMessage: z.literal(false).optional(),
    resolution: moderationResolutionSchema,
    status: z.literal("DISMISSED"),
  }).strict(),
]);

export const conversationMessagesQuerySchema = z.object({
  after: z.string().trim().min(1).max(2048).optional(),
  cursor: z.string().trim().min(1).max(2048).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine((input) => !(input.after && input.cursor), {
  message: "Use either after or cursor, not both.",
  path: ["after"],
});

export const conversationListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(2048).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

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
  buyerProfileId: cuidBackedIdSchema,
  propertyId: cuidBackedIdSchema,
  templateKey: sellerGuidedMessageTemplateKeySchema,
  templateVersion: guidedMessageTemplateVersionSchema,
  note: optionalMessageNoteSchema,
  termsAccepted: z.literal(true),
}).strict();

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
export type SendConversationMessageInput = z.infer<typeof sendConversationMessageSchema>;
export type MarkConversationReadInput = z.infer<typeof markConversationReadSchema>;
export type MuteConversationInput = z.infer<typeof muteConversationSchema>;
export type BlockConversationInput = z.infer<typeof blockConversationSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
export type ResolveMessageReportInput = z.infer<typeof resolveMessageReportSchema>;
export type SearchBuyersInput = z.infer<typeof searchBuyersSchema>;
export type SellerAccessReviewInput = z.infer<typeof sellerAccessReviewSchema>;
export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;
