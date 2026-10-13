import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteSendError } from "./invite-send-errors";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(), transaction: vi.fn(), query: vi.fn(), buyer: vi.fn(), property: vi.fn(), count: vi.fn(), duplicate: vi.fn(), access: vi.fn(), create: vi.fn(), pairAvailable: vi.fn(), messagingEnabled: vi.fn(),
}));
vi.mock("@liber/db", async () => ({
  Prisma: (await import("../../../packages/db/src/generated/client")).Prisma,
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("./access", () => ({ requireApprovedSellerAccess: mocks.requireAccess }));
vi.mock("./rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("./messaging/service", () => ({ lockAndAssertInvitePairAvailable: mocks.pairAvailable, usersHaveMessagingBlock: vi.fn() }));
vi.mock("./messaging/feature", () => ({ messagingV1EnabledForPair: mocks.messagingEnabled }));

import { sendInvite } from "./contracts";

const input = { buyerProfileId: "synthetic-buyer", propertyId: "synthetic-property", templateKey: "SELLER_PRIVATE_VIEWING", templateVersion: 1, termsAccepted: true };
const property = { id: input.propertyId, identityVersion: 1, status: "READY_FOR_INVITES", ownershipVerificationStatus: "APPROVED", authorityAttestedByUserId: "synthetic-seller", authorityAttestedIdentityVersion: 1 };

describe("invite duplicate recovery authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAccess.mockResolvedValue({ id: "synthetic-seller" });
    mocks.buyer.mockResolvedValue({ userId: "synthetic-buyer-user" });
    mocks.property.mockResolvedValue(property);
    mocks.count.mockResolvedValue(1);
    mocks.duplicate.mockResolvedValue({ id: "synthetic-invite", conversation: { id: "synthetic-conversation" } });
    mocks.access.mockResolvedValue({ id: "synthetic-access" });
    mocks.messagingEnabled.mockReturnValue(true);
    mocks.transaction.mockImplementation((operation) => operation({
      $queryRaw: mocks.query, buyerProfile: { findFirst: mocks.buyer }, sellerProperty: { findFirst: mocks.property }, invite: { count: mocks.count, findFirst: mocks.duplicate, create: mocks.create }, sellerAccess: { findFirst: mocks.access },
    }));
  });

  it("returns the authorized conversation while preserving duplicate protection", async () => {
    await expect(sendInvite(input)).rejects.toMatchObject({ code: "DUPLICATE", context: { conversationId: "synthetic-conversation" } });
    expect(mocks.duplicate).toHaveBeenCalledWith(expect.objectContaining({ where: { buyerProfileId: input.buyerProfileId, propertyId: input.propertyId, sellerId: "synthetic-seller", status: { in: ["SENT", "VIEWED", "ACCEPTED"] } } }));
    expect(mocks.pairAvailable).toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("omits the conversation route when messaging is disabled", async () => {
    mocks.messagingEnabled.mockReturnValue(false);
    await expect(sendInvite(input)).rejects.toMatchObject({ code: "DUPLICATE", context: { conversationId: undefined } });
  });

  it("never exposes a duplicate's conversation when pair access is unavailable", async () => {
    const unavailable = new Error("unavailable fixture");
    mocks.pairAvailable.mockRejectedValue(unavailable);
    await expect(sendInvite(input)).rejects.toBe(unavailable);
    expect(mocks.messagingEnabled).not.toHaveBeenCalled();
  });

  it("checks property ownership and current approval before exposing a duplicate", async () => {
    mocks.property.mockResolvedValue(null);
    await expect(sendInvite(input)).rejects.toMatchObject({ code: "PROPERTY_UNAVAILABLE", context: {} });
    mocks.property.mockResolvedValue({ ...property, identityVersion: 2 });
    await expect(sendInvite(input)).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED", context: { propertyId: input.propertyId } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves unexpected transaction errors", async () => {
    const error = new Error("database fixture failure");
    mocks.transaction.mockRejectedValue(error);
    await expect(sendInvite(input)).rejects.toBe(error);
    expect(error).not.toBeInstanceOf(InviteSendError);
  });
});
