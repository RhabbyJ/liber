import { describe, expect, it } from "vitest";
import {
  blockConversationSchema,
  buyerGuidedMessageTemplateKeyValues,
  conversationListQuerySchema,
  conversationMessagesQuerySchema,
  conversationRouteParamsSchema,
  createBuyerProfileSchema,
  createSellerPropertySchema,
  grantBadgeSchema,
  guidedMessageTemplateKeySchema,
  markConversationReadSchema,
  messageBodySchema,
  messageReportCategorySchema,
  muteConversationSchema,
  reportMessageSchema,
  resolveMessageReportSchema,
  reviewDocumentSchema,
  searchBuyersSchema,
  sellerAccessReviewSchema,
  sellerGuidedMessageTemplateKeyValues,
  sendConversationMessageSchema,
  sendInviteSchema,
  updateBuyerProfileSchema,
  upsertBuyerCriteriaSchema,
} from "./index";

const conversationId = "019f62c5-1c07-7a62-9f9a-8302778aa011";
const messageId = "019f62c5-1c07-7a62-9f9a-8302778aa012";
const clientMessageId = "019f62c5-1c07-7a62-9f9a-8302778aa013";

describe("Liber validators", () => {
  it("rejects reversed buyer budget ranges", () => {
    expect(() =>
      createBuyerProfileSchema.parse({
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("does not allow buyers to self-assign admin-controlled visibility states", () => {
    expect(() =>
      createBuyerProfileSchema.parse({
        visibilityStatus: "HIDDEN",
      }),
    ).toThrow();
  });

  it("keeps buyer profile property intent allowlisted", () => {
    expect(createBuyerProfileSchema.parse({
      buyerType: "Conventional financing",
      buyingPurpose: "Townhouse",
    })).toMatchObject({
      buyerType: "Conventional financing",
      buyingPurpose: "Townhouse",
    });

    expect(() =>
      createBuyerProfileSchema.parse({
        buyingPurpose: "Rental",
      }),
    ).toThrow();

    expect(() =>
      createBuyerProfileSchema.parse({
        buyerType: "Investor",
      }),
    ).toThrow();
  });

  it("strips public alias from buyer profile API input", () => {
    expect(createBuyerProfileSchema.parse({ displayName: "Maple Haven" })).not.toHaveProperty("displayName");
    expect(updateBuyerProfileSchema.parse({ displayName: "Maple Haven" })).not.toHaveProperty("displayName");
  });

  it("keeps omitted buyer update visibility unchanged", () => {
    expect(updateBuyerProfileSchema.parse({ buyerType: "Cash" })).not.toHaveProperty("visibilityStatus");
    expect(() =>
      updateBuyerProfileSchema.parse({
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("allows custom buyer budget and down payment amounts", () => {
    expect(updateBuyerProfileSchema.parse({
      budgetMax: "987654",
      budgetMin: "731249",
      desiredMarketSlug: "los-angeles",
      desiredNeighborhood: "Northridge",
      desiredPostalCode: "91325",
      desiredServiceAreaSlug: "91325",
      downPaymentMax: "223457",
      downPaymentMin: "123456",
    })).toMatchObject({
      budgetMax: 987654,
      budgetMin: 731249,
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "91325",
      downPaymentMax: 223457,
      downPaymentMin: 123456,
    });

    expect(() =>
      updateBuyerProfileSchema.parse({ desiredServiceAreaSlug: "../91325" }),
    ).toThrow();
  });

  it("allows buyer geography fields to be explicitly cleared", () => {
    const parsed = updateBuyerProfileSchema.parse({
      desiredCity: null,
      desiredLat: null,
      desiredLng: null,
      desiredLocationText: null,
      desiredNeighborhood: null,
      desiredPostalCode: null,
      desiredServiceAreaSlug: null,
      desiredState: null,
    });
    expect(parsed).toEqual({
      desiredServiceAreaSlug: null,
    });
  });

  it("requires accepted terms for invite sending", () => {
    expect(() =>
      sendInviteSchema.parse({
        buyerProfileId: "buyer-1",
        propertyId: "property-1",
        templateKey: "SELLER_PRIVATE_VIEWING",
        templateVersion: 1,
        termsAccepted: false,
      }),
    ).toThrow();
  });

  it("accepts only a versioned seller template and optional normalized invite note", () => {
    expect(sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      note: "  Cafe\u0301\r\nviewing?  ",
      propertyId: "property-1",
      templateKey: "SELLER_MORE_DETAILS",
      templateVersion: 1,
      termsAccepted: true,
    })).toEqual({
      buyerProfileId: "buyer-1",
      note: "Caf\u00e9\nviewing?",
      propertyId: "property-1",
      templateKey: "SELLER_MORE_DETAILS",
      templateVersion: 1,
      termsAccepted: true,
    });

    expect(() => sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      propertyId: "property-1",
      templateKey: "BUYER_MORE_DETAILS",
      templateVersion: 1,
      termsAccepted: true,
    })).toThrow();

    expect(sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      note: "   ",
      propertyId: "property-1",
      templateKey: "SELLER_NEXT_STEPS",
      templateVersion: 1,
      termsAccepted: true,
    }).note).toBeUndefined();
    expect(() => sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      propertyId: "property-1",
      templateKey: "SELLER_MORE_DETAILS",
      templateVersion: 2,
      termsAccepted: true,
    })).toThrow();
  });

  it("removes client-authored invite title and message fields from the contract", () => {
    expect(() => sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      message: "Client-rendered copy must not be accepted.",
      propertyId: "property-1",
      templateKey: "SELLER_NEXT_STEPS",
      templateVersion: 1,
      termsAccepted: true,
      title: "Client title",
    })).toThrow();
  });

  it("allowlists all reviewed guided-message template keys", () => {
    for (const templateKey of [
      ...sellerGuidedMessageTemplateKeyValues,
      ...buyerGuidedMessageTemplateKeyValues,
    ]) {
      expect(guidedMessageTemplateKeySchema.parse(templateKey)).toBe(templateKey);
    }
    expect(() => guidedMessageTemplateKeySchema.parse("CUSTOM_PROMPT")).toThrow();
  });

  it("validates strict guided and free-text message bodies", () => {
    expect(sendConversationMessageSchema.parse({
      clientMessageId,
      kind: "GUIDED",
      templateKey: "BUYER_SCHEDULE_VIEWING",
      templateVersion: 1,
    })).toEqual({
      clientMessageId,
      kind: "GUIDED",
      templateKey: "BUYER_SCHEDULE_VIEWING",
      templateVersion: 1,
    });

    const freeText = sendConversationMessageSchema.parse({
      body: "  Cafe\u0301\rquestion  ",
      clientMessageId,
      kind: "FREE_TEXT",
    });
    expect(freeText.kind === "FREE_TEXT" ? freeText.body : null).toBe("Caf\u00e9\nquestion");

    expect(() => sendConversationMessageSchema.parse({
      body: "The server renders guided text.",
      clientMessageId,
      kind: "GUIDED",
      templateKey: "BUYER_MORE_DETAILS",
      templateVersion: 1,
    })).toThrow();
    expect(() => sendConversationMessageSchema.parse({ clientMessageId, kind: "SYSTEM" })).toThrow();
    expect(() => sendConversationMessageSchema.parse({ clientMessageId, kind: "INVITE" })).toThrow();
  });

  it("rejects empty, oversized, null-containing, and malformed Unicode text", () => {
    expect(() => messageBodySchema.parse(" \r\n ")).toThrow();
    expect(() => messageBodySchema.parse("x".repeat(2001))).toThrow();
    expect(messageBodySchema.parse("\ud83c\udfe1".repeat(2000))).toHaveLength(4000);
    expect(() => messageBodySchema.parse("\ud83c\udfe1".repeat(2001))).toThrow("at most 2000 characters");
    expect(() => messageBodySchema.parse("hello\u0000world")).toThrow();
    expect(() => messageBodySchema.parse("broken\ud800")).toThrow("malformed Unicode");
    expect(() => messageBodySchema.parse("broken\udfff")).toThrow("malformed Unicode");
    expect(messageBodySchema.parse("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("validates UUID route and read-state inputs", () => {
    expect(conversationRouteParamsSchema.parse({ conversationId: ` ${conversationId} ` })).toEqual({
      conversationId,
    });
    expect(markConversationReadSchema.parse({ lastReadMessageId: messageId })).toEqual({
      lastReadMessageId: messageId,
    });
    expect(() => conversationRouteParamsSchema.parse({ conversationId: "conversation-1" })).toThrow();
    expect(() => markConversationReadSchema.parse({ lastReadMessageId: "message-1" })).toThrow();
  });

  it("validates mute, block, report, and report-resolution inputs", () => {
    expect(muteConversationSchema.parse({ muted: true })).toEqual({ muted: true });
    expect(blockConversationSchema.parse({ reason: "  repeated spam  " })).toEqual({ reason: "repeated spam" });

    for (const category of messageReportCategorySchema.options) {
      expect(reportMessageSchema.parse({ category })).toEqual({
        block: false,
        category,
      });
    }
    expect(reportMessageSchema.parse({ block: true, category: "SPAM", details: "  Repeated links. " })).toEqual({
      block: true,
      category: "SPAM",
      details: "Repeated links.",
    });
    expect(() => reportMessageSchema.parse({ category: "DISLIKE" })).toThrow();
    expect(() => resolveMessageReportSchema.parse({ status: "ACTIONED" })).toThrow();
    expect(() => resolveMessageReportSchema.parse({ redactMessage: true, status: "IN_REVIEW" })).toThrow();
    expect(() => resolveMessageReportSchema.parse({ resolution: "Not needed yet.", status: "IN_REVIEW" })).toThrow();
    expect(() => resolveMessageReportSchema.parse({ status: "DISMISSED" })).toThrow();
    expect(() => resolveMessageReportSchema.parse({
      redactMessage: true,
      resolution: "No violation.",
      status: "DISMISSED",
    })).toThrow();
    expect(resolveMessageReportSchema.parse({
      resolution: "  No policy violation. ",
      status: "DISMISSED",
    })).toEqual({
      resolution: "No policy violation.",
      status: "DISMISSED",
    });
    expect(resolveMessageReportSchema.parse({
      redactMessage: true,
      resolution: "  Removed from participant view. ",
      status: "ACTIONED",
    })).toEqual({
      redactMessage: true,
      resolution: "Removed from participant view.",
      status: "ACTIONED",
    });
  });

  it("defaults conversation message pagination to a bounded keyset page", () => {
    expect(conversationMessagesQuerySchema.parse({})).toEqual({ pageSize: 50 });
    expect(conversationMessagesQuerySchema.parse({ cursor: "opaque", pageSize: "100" })).toEqual({
      cursor: "opaque",
      pageSize: 100,
    });
    expect(conversationMessagesQuerySchema.parse({ after: messageId })).toEqual({
      after: messageId,
      pageSize: 50,
    });
    expect(conversationMessagesQuerySchema.parse({ after: "server-signed-cursor" })).toEqual({
      after: "server-signed-cursor",
      pageSize: 50,
    });
    expect(() => conversationMessagesQuerySchema.parse({ after: messageId, cursor: "opaque" })).toThrow(
      "either after or cursor",
    );
    expect(() => conversationMessagesQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it("bounds conversation inbox pagination", () => {
    expect(conversationListQuerySchema.parse({})).toEqual({ pageSize: 25 });
    expect(conversationListQuerySchema.parse({ cursor: "opaque", pageSize: "50" })).toEqual({
      cursor: "opaque",
      pageSize: 50,
    });
    expect(() => conversationListQuerySchema.parse({ pageSize: 51 })).toThrow();
  });

  it("keeps seller property input structured", () => {
    const property = createSellerPropertySchema.parse({
      propertyType: "CONDO",
      price: "925000",
      bedrooms: "4",
      features: ["Garage"],
      ownershipConfirmed: true,
    });

    expect(property.price).toBe(925000);
    expect(property.bedrooms).toBe(4);
    expect(property.propertyType).toBe("CONDO");
  });

  it("rejects property creation without ownership confirmation", () => {
    expect(() =>
      createSellerPropertySchema.parse({
        propertyType: "HOME",
        price: "925000",
      }),
    ).toThrow();
  });

  it("rejects reversed searchable criteria ranges", () => {
    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertySubtype: "HOME",
        squareFeetMin: 2000,
        squareFeetMax: 1000,
      }),
    ).toThrow("Square feet minimum cannot exceed square feet maximum.");

    // Non-residential subtypes are out of v1 scope.
    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertySubtype: "MULTIFAMILY",
      }),
    ).toThrow();
  });

  it("allows custom square footage and lot size amounts", () => {
    expect(upsertBuyerCriteriaSchema.parse({
      buyerProfileId: "buyer-1",
      lotSizeMax: "8765",
      lotSizeMin: "7654",
      propertySubtype: "TOWNHOUSE",
      squareFeetMax: "2345",
      squareFeetMin: "1234",
    })).toMatchObject({
      lotSizeMax: 8765,
      lotSizeMin: 7654,
      propertySubtype: "TOWNHOUSE",
      squareFeetMax: 2345,
      squareFeetMin: 1234,
    });
  });

  it("validates search, document review, and badge admin inputs", () => {
    const market = { market: "los-angeles" };
    expect(searchBuyersSchema.parse({ ...market, badges: ["PRE_APPROVED"], sort: "most_verified" }).badges).toEqual([
      "PRE_APPROVED",
    ]);
    expect(searchBuyersSchema.parse({
      ...market,
      centerLat: 34.2381,
      centerLng: -118.5301,
      city: "Glendale",
      radiusMiles: 10,
      state: "AZ",
    })).toEqual({
      amenities: [],
      badges: [],
      market: "los-angeles",
      pageSize: 24,
      sort: "recommended",
    });
    expect(searchBuyersSchema.parse({ ...market, serviceArea: "northridge" }).serviceArea).toBe("northridge");
    expect(() => searchBuyersSchema.parse({ ...market, serviceArea: "../northridge" })).toThrow();
    expect(searchBuyersSchema.parse({ ...market, bedrooms: "4", bathrooms: "2" })).toMatchObject({
      bathrooms: 2,
      bedrooms: 4,
    });
    expect(searchBuyersSchema.parse({ ...market, amenities: ["Pool", "ADU"], condition: "Fixer" })).toMatchObject({
      amenities: ["Pool", "ADU"],
      condition: "Fixer",
    });
    expect(searchBuyersSchema.parse({ ...market, pageSize: "100" }).pageSize).toBe(100);
    expect(() => searchBuyersSchema.parse({ ...market, pageSize: 101 })).toThrow();
    expect(() => searchBuyersSchema.parse({ ...market, amenities: ["Elevator"] })).toThrow();
    expect(searchBuyersSchema.parse({ ...market, budgetMin: "900000", budgetMax: "1200000" })).toMatchObject({
      budgetMax: 1200000,
      budgetMin: 900000,
    });
    expect(() => searchBuyersSchema.parse({ ...market, budgetMin: "1200000", budgetMax: "900000" })).toThrow(
      "Budget minimum cannot exceed budget maximum.",
    );
    expect(reviewDocumentSchema.parse({ documentId: "doc-1", decision: "APPROVED" }).decision).toBe("APPROVED");
    expect(grantBadgeSchema.parse({ buyerProfileId: "buyer-1", badgeType: "VERIFIED_FUNDS" }).badgeType).toBe(
      "VERIFIED_FUNDS",
    );
    expect(grantBadgeSchema.parse({
      badgeType: "VERIFIED_FUNDS",
      buyerProfileId: "buyer-1",
      evidenceDocumentId: "doc-1",
    }).evidenceDocumentId).toBe("doc-1");
    expect(sellerAccessReviewSchema.parse({ userId: "seller-1", status: "APPROVED" }).status).toBe("APPROVED");
    expect(() => sellerAccessReviewSchema.parse({ userId: "seller-1", status: "ACTIVE" })).toThrow();
  });
});
