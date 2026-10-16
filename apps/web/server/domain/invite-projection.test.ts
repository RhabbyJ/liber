import { describe, expect, it, vi } from "vitest";

vi.mock("@liber/db", () => ({ prisma: {} }));
vi.mock("../messaging/feature", () => ({ messagingV1EnabledForPair: () => true }));

import { inviteFromDb, inviteStatusLabel } from "./invite-projection";

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1_000);

function invite(status: string, overrides: { expiresAt?: Date | null; propertyIdentityVersion?: number } = {}) {
  return {
    buyerProfile: { displayName: "Synthetic", userId: "10000000-0000-4000-8000-000000000001", user: { name: "Synthetic Buyer" } },
    buyerProfileId: "synthetic-profile",
    conversation: { id: "20000000-0000-4000-8000-000000000001", messages: [] },
    id: "synthetic-invite",
    message: "Synthetic opening",
    property: { addressLine1: "123 Example St", city: "Los Angeles", identityVersion: 2, ownershipVerificationStatus: "APPROVED", propertyType: "HOME" as const },
    propertyId: "synthetic-property",
    propertyIdentityVersion: overrides.propertyIdentityVersion ?? 2,
    sellerId: "10000000-0000-4000-8000-000000000002",
    sentAt: new Date("2026-10-12T17:00:00.000Z"),
    expiresAt: overrides.expiresAt === undefined ? future : overrides.expiresAt,
    status,
    title: "Property invitation",
  };
}

describe("invite status labels", () => {
  it.each([
    ["SENT", "Sent"],
    ["VIEWED", "Viewed"],
    ["ACCEPTED", "Accepted"],
    ["DECLINED", "Declined"],
    ["EXPIRED", "Expired"],
    ["WITHDRAWN", "Withdrawn"],
  ])("labels a current %s invite as %s", (status, label) => {
    expect(inviteStatusLabel({ status, expiresAt: future }, true)).toBe(label);
    expect(inviteFromDb(invite(status)).status).toBe(label);
  });

  it("labels withdrawn invites as Withdrawn, not Expired, even after their deadline", () => {
    expect(inviteStatusLabel({ status: "WITHDRAWN", expiresAt: past }, true)).toBe("Withdrawn");
    expect(inviteFromDb(invite("WITHDRAWN", { expiresAt: past })).status).toBe("Withdrawn");
  });

  it("expires only unanswered invites once the deadline passes", () => {
    expect(inviteStatusLabel({ status: "SENT", expiresAt: past }, true)).toBe("Expired");
    expect(inviteStatusLabel({ status: "VIEWED", expiresAt: past }, true)).toBe("Expired");
    expect(inviteStatusLabel({ status: "ACCEPTED", expiresAt: past }, true)).toBe("Accepted");
  });

  it("treats an open invite on a stale property identity as withdrawn and keeps terminal labels", () => {
    expect(inviteFromDb(invite("SENT", { propertyIdentityVersion: 1 })).status).toBe("Withdrawn");
    expect(inviteFromDb(invite("ACCEPTED", { propertyIdentityVersion: 1 })).status).toBe("Withdrawn");
    expect(inviteFromDb(invite("DECLINED", { propertyIdentityVersion: 1 })).status).toBe("Declined");
    expect(inviteFromDb(invite("EXPIRED", { propertyIdentityVersion: 1 })).status).toBe("Expired");
  });
});
