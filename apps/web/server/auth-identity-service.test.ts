import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: {
    $transaction: db.transaction,
    user: {
      findFirst: db.findFirst,
      findUnique: db.findUnique,
    },
  },
}));

import { persistUserRolesForAuthIdentity } from "./auth-identity";

const authUser = {
  email: "buyer@example.test",
  id: "11111111-1111-4111-8111-111111111111",
};

describe("auth identity role persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: db.queryRaw,
        user: { findFirst: db.findFirst, update: db.update },
      }),
    );
    db.findFirst.mockResolvedValue({ id: authUser.id });
  });

  it("locks the identity row before merging self-selected roles", async () => {
    db.queryRaw.mockResolvedValue([
      { ...authUser, roles: ["ADMIN"], status: "ACTIVE" },
    ]);
    db.update.mockResolvedValue({
      ...authUser,
      roles: ["ADMIN", "SELLER"],
      status: "ACTIVE",
    });

    await expect(
      persistUserRolesForAuthIdentity({
        authUser,
        mode: "merge",
        roles: ["SELLER"],
      }),
    ).resolves.toMatchObject({ roles: ["ADMIN", "SELLER"] });

    const sql = db.queryRaw.mock.calls[0]?.[0]?.join("") ?? "";
    expect(sql).toContain("FOR UPDATE");
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["ADMIN", "SELLER"] } }),
    );
  });

  it("does not update a suspended, missing, or colliding identity", async () => {
    db.queryRaw.mockResolvedValue([
      { ...authUser, roles: ["BUYER"], status: "SUSPENDED" },
    ]);
    await expect(
      persistUserRolesForAuthIdentity({ authUser, mode: "merge", roles: ["SELLER"] }),
    ).rejects.toMatchObject({ code: "inactive" });

    db.queryRaw.mockResolvedValue([]);
    db.findFirst.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    await expect(
      persistUserRolesForAuthIdentity({ authUser, mode: "merge", roles: ["SELLER"] }),
    ).rejects.toMatchObject({ code: "collision" });

    db.findFirst.mockResolvedValue(null);
    await expect(
      persistUserRolesForAuthIdentity({ authUser, mode: "merge", roles: ["SELLER"] }),
    ).rejects.toMatchObject({ code: "missing" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects ADMIN even if a future caller bypasses form metadata allowlists", async () => {
    db.queryRaw.mockResolvedValue([
      { ...authUser, roles: [], status: "ACTIVE" },
    ]);

    await expect(
      persistUserRolesForAuthIdentity({
        authUser,
        mode: "merge",
        roles: ["ADMIN"],
      }),
    ).rejects.toThrow("ADMIN cannot be assigned");
    expect(db.update).not.toHaveBeenCalled();
  });
});
