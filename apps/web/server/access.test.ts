import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getSessionUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: { sellerAccess: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock("./session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import {
  canViewBuyerDirectory,
  canViewBuyerProfile,
  ensureSellerAccessRequested,
  requireApprovedSellerAccess,
  sellerAccessStatusForUser,
} from "./access";
import type { AppRole } from "./authz";

const sellerId = "22222222-2222-4222-8222-222222222222";
const buyerUserId = "33333333-3333-4333-8333-333333333333";
const user = (...roles: AppRole[]) => ({ id: sellerId, roles });
const accessQuery = { where: { userId: sellerId }, select: { status: true } };

describe("seller access request creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.upsert.mockResolvedValue({ id: "seller-access" });
  });

  it("uses the unique user key as a race-safe idempotent upsert", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";

    await expect(ensureSellerAccessRequested(userId)).resolves.toBeUndefined();

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId },
      create: { status: "PENDING", userId },
      update: {},
      select: { id: true },
    });
  });
});

describe("seller directory gates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue({ status: "APPROVED" });
  });

  it("reads only the status of the user's own access row", async () => {
    await expect(sellerAccessStatusForUser(sellerId)).resolves.toBe("APPROVED");
    expect(mocks.findUnique).toHaveBeenCalledWith(accessQuery);
    mocks.findUnique.mockResolvedValue(null);
    await expect(sellerAccessStatusForUser(sellerId)).resolves.toBeNull();
  });

  it("opens the directory to admins and never to accounts without the seller role", async () => {
    await expect(canViewBuyerDirectory(user("ADMIN"))).resolves.toBe(true);
    await expect(canViewBuyerDirectory(user("BUYER"))).resolves.toBe(false);
    await expect(canViewBuyerDirectory(user())).resolves.toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["APPROVED", true],
    ["PENDING", false],
    ["REJECTED", false],
    ["SUSPENDED", false],
  ])("requires APPROVED seller access: %s -> %s", async (status, allowed) => {
    mocks.findUnique.mockResolvedValue({ status });
    await expect(canViewBuyerDirectory(user("SELLER", "BUYER"))).resolves.toBe(allowed);
    expect(mocks.findUnique).toHaveBeenCalledWith(accessQuery);
  });

  it("denies a seller whose access row is missing", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(canViewBuyerDirectory(user("SELLER"))).resolves.toBe(false);
  });

  it("redirects a missing session to login before reading access", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(requireApprovedSellerAccess()).rejects.toThrow("redirect:/login");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns a buyer-only account to its own workspace", async () => {
    mocks.getSessionUser.mockResolvedValue(user("BUYER"));
    await expect(requireApprovedSellerAccess()).rejects.toThrow("redirect:/buyer/profile");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED"])("refuses a %s seller after checking the database status", async (status) => {
    mocks.getSessionUser.mockResolvedValue(user("SELLER"));
    mocks.findUnique.mockResolvedValue({ status });
    await expect(requireApprovedSellerAccess()).rejects.toThrow("Seller directory access is pending admin approval.");
    expect(mocks.findUnique).toHaveBeenCalledWith(accessQuery);
  });

  it("returns the approved seller session", async () => {
    const seller = user("SELLER");
    mocks.getSessionUser.mockResolvedValue(seller);
    await expect(requireApprovedSellerAccess()).resolves.toBe(seller);
  });

  it("lets an admin search without a seller access row", async () => {
    const admin = user("ADMIN");
    mocks.getSessionUser.mockResolvedValue(admin);
    await expect(requireApprovedSellerAccess()).resolves.toBe(admin);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("checks an explicitly supplied user without reloading the session", async () => {
    mocks.findUnique.mockResolvedValue({ status: "PENDING" });
    await expect(requireApprovedSellerAccess(user("SELLER"))).rejects.toThrow("pending admin approval");
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
  });

  it("shows a profile to its owner or an admin without a directory check", async () => {
    await expect(canViewBuyerProfile({ id: buyerUserId, roles: ["BUYER"] }, buyerUserId)).resolves.toBe(true);
    await expect(canViewBuyerProfile(user("ADMIN"), buyerUserId)).resolves.toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("shows another buyer's profile only to an approved seller", async () => {
    await expect(canViewBuyerProfile(user("SELLER"), buyerUserId)).resolves.toBe(true);
    mocks.findUnique.mockResolvedValue({ status: "PENDING" });
    await expect(canViewBuyerProfile(user("SELLER"), buyerUserId)).resolves.toBe(false);
    await expect(canViewBuyerProfile(user("BUYER"), buyerUserId)).resolves.toBe(false);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });
});
