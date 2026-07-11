import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  prisma: { sellerAccess: { upsert } },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ensureSellerAccessRequested } from "./access";

describe("seller access request creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ id: "seller-access" });
  });

  it("uses the unique user key as a race-safe idempotent upsert", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";

    await expect(ensureSellerAccessRequested(userId)).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith({
      where: { userId },
      create: { status: "PENDING", userId },
      update: {},
      select: { id: true },
    });
  });
});
