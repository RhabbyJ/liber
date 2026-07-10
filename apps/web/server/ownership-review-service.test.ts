import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  adminAuditCreate: vi.fn(),
  documentFindMany: vi.fn(),
  documentFindUnique: vi.fn(),
  documentFindUniqueOrThrow: vi.fn(),
  documentUpdateMany: vi.fn(),
  notificationCreate: vi.fn(),
  pendingDocumentFindMany: vi.fn(),
  propertyFindUnique: vi.fn(),
  propertyUpdate: vi.fn(),
  transaction: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  Prisma: {},
  prisma: {
    $transaction: db.transaction,
    verificationDocument: { findMany: db.pendingDocumentFindMany },
  },
}));

vi.mock("./session", () => ({
  getSessionUser: vi.fn(async () => ({ id: "admin-1", roles: ["ADMIN"] })),
}));

vi.mock("./supabase", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ createSignedUrl: storage.createSignedUrl })),
    },
  })),
  createSupabaseServerClient: vi.fn(async () => null),
}));

import { listPendingDocuments, reviewDocument } from "./contracts";

const legacyDocument = {
  buyerProfileId: null,
  documentType: "OWNERSHIP",
  id: "legacy-document",
  ownershipEvidenceKind: "GOVERNMENT_ID",
  propertyId: "property-1",
  propertyOwnershipVersion: null,
  reviewStatus: "PENDING",
  storagePath: "seller-1/legacy-document.pdf",
  userId: "seller-1",
};

const property = {
  id: "property-1",
  ownerUserId: "seller-1",
  ownershipVersion: 4,
};

describe("ownership review service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback({
      adminAuditLog: { create: db.adminAuditCreate },
      notification: { create: db.notificationCreate },
      sellerProperty: {
        findUnique: db.propertyFindUnique,
        update: db.propertyUpdate,
      },
      verificationDocument: {
        findMany: db.documentFindMany,
        findUnique: db.documentFindUnique,
        findUniqueOrThrow: db.documentFindUniqueOrThrow,
        updateMany: db.documentUpdateMany,
      },
    }));
    db.documentFindUnique.mockResolvedValue(legacyDocument);
    db.propertyFindUnique.mockResolvedValue(property);
    db.documentUpdateMany.mockResolvedValue({ count: 1 });
    db.documentFindUniqueOrThrow.mockResolvedValue({
      ...legacyDocument,
      reviewStatus: "REJECTED",
    });
    db.documentFindMany.mockResolvedValue([]);
    db.propertyUpdate.mockResolvedValue(property);
    db.notificationCreate.mockResolvedValue({});
    db.adminAuditCreate.mockResolvedValue({});
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.invalid/signed" },
      error: null,
    });
  });

  it("returns null-version ownership evidence as stale and audit-only", async () => {
    db.pendingDocumentFindMany.mockResolvedValue([{
      ...legacyDocument,
      buyerProfile: null,
      property: {
        addressLine1: "123 Original St",
        city: "Los Angeles",
        ownershipVersion: property.ownershipVersion,
        propertyType: "HOME",
      },
      user: { email: "seller@example.test", name: "Seller" },
    }]);

    const result = await listPendingDocuments();

    expect(result.data[0]).toMatchObject({
      id: legacyDocument.id,
      ownershipEvidenceAuditOnly: true,
      ownershipEvidenceStale: true,
    });
  });

  it("rejects approval of legacy evidence before any review write", async () => {
    await expect(reviewDocument({
      decision: "APPROVED",
      documentId: legacyDocument.id,
    })).rejects.toThrow("Legacy ownership evidence is audit-only");

    expect(db.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("allows rejection and classification without rebinding legacy evidence", async () => {
    db.documentFindUnique.mockResolvedValue({
      ...legacyDocument,
      ownershipEvidenceKind: null,
    });
    db.documentFindUniqueOrThrow.mockResolvedValue({
      ...legacyDocument,
      ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF",
      reviewStatus: "REJECTED",
    });

    await expect(reviewDocument({
      decision: "REJECTED",
      documentId: legacyDocument.id,
      ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF",
      rejectionReason: "Historical evidence retained for audit only.",
    })).resolves.toMatchObject({ ok: true });

    const update = db.documentUpdateMany.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF",
      reviewStatus: "REJECTED",
    });
    expect(update.data).not.toHaveProperty("propertyOwnershipVersion");
  });
});
