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
    $queryRaw: db.queryRaw,
    $transaction: db.transaction,
    user: {
      findFirst: db.findFirst,
      findUnique: db.findUnique,
    },
  },
}));

import {
  persistUserRolesForAuthIdentity,
  signupStatusForAuthFailure,
} from "./auth-identity";

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

  it("locks the identity row without replacing an existing role set", async () => {
    db.queryRaw.mockResolvedValue([
      { ...authUser, roles: ["ADMIN"], status: "ACTIVE" },
    ]);
    db.update.mockResolvedValue({
      ...authUser,
      roles: ["ADMIN"],
      status: "ACTIVE",
    });

    await expect(
      persistUserRolesForAuthIdentity({
        authUser,
        roles: ["SELLER"],
      }),
    ).resolves.toMatchObject({ roles: ["ADMIN"] });

    const sql = db.queryRaw.mock.calls[0]?.[0]?.join("") ?? "";
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("roles::text[] AS roles");
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["ADMIN"] } }),
    );
  });

  it("does not update a suspended, missing, or colliding identity", async () => {
    db.queryRaw.mockResolvedValue([
      { ...authUser, roles: ["BUYER"], status: "SUSPENDED" },
    ]);
    await expect(
      persistUserRolesForAuthIdentity({ authUser, roles: ["SELLER"] }),
    ).rejects.toMatchObject({ code: "inactive" });

    db.queryRaw.mockResolvedValue([]);
    db.findFirst.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    await expect(
      persistUserRolesForAuthIdentity({ authUser, roles: ["SELLER"] }),
    ).rejects.toMatchObject({ code: "collision" });

    db.findFirst.mockResolvedValue(null);
    await expect(
      persistUserRolesForAuthIdentity({ authUser, roles: ["SELLER"] }),
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
        roles: ["ADMIN"],
      }),
    ).rejects.toThrow("ADMIN cannot be assigned");
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("signup failure classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ code: "user_already_exists" }, "account-exists"],
    [{ code: "weak_password" }, "weak-password"],
    [{ code: "email_address_invalid" }, "invalid-email"],
    [{ code: "over_request_rate_limit" }, "rate-limited"],
    [{ status: 429 }, "rate-limited"],
  ] as const)("uses structured Supabase fields for %o", async (error, expected) => {
    await expect(signupStatusForAuthFailure(error, authUser.email)).resolves.toBe(expected);
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("checks normalized application ownership after an opaque Supabase failure", async () => {
    db.queryRaw.mockResolvedValueOnce([{ id: authUser.id }]);

    await expect(
      signupStatusForAuthFailure(
        { code: "unexpected_failure", status: 500 },
        " Buyer@Example.Test ",
      ),
    ).resolves.toBe("identity-recovery-required");

    const sql = db.queryRaw.mock.calls[0]?.[0]?.join("") ?? "";
    expect(sql).toContain("lower(btrim(email))");
    expect(db.queryRaw.mock.calls[0]).toContain("buyer@example.test");
  });

  it("keeps an opaque failure generic when no application identity collides", async () => {
    db.queryRaw.mockResolvedValueOnce([]);

    await expect(
      signupStatusForAuthFailure(
        { code: "unexpected_failure", status: 500 },
        authUser.email,
      ),
    ).resolves.toBe("signup-error");
  });
});
