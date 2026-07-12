import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSellerAccess: vi.fn(),
  enforceLimit: vi.fn(),
  headers: vi.fn(),
  persistRoles: vi.fn(),
  redirect: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("./access", () => ({
  ensureSellerAccessRequested: mocks.ensureSellerAccess,
}));

vi.mock("./auth-identity", () => ({
  AuthIdentityLinkError: class AuthIdentityLinkError extends Error {},
  persistUserRolesForAuthIdentity: mocks.persistRoles,
  signupStatusForAuthFailure: vi.fn(),
}));

vi.mock("./auth-rate-limit", () => ({
  enforceSharedAuthRateLimit: mocks.enforceLimit,
}));

vi.mock("./rate-limit", () => ({
  clientIpFromHeaders: () => "203.0.113.10",
}));

vi.mock("./supabase", () => ({
  createSupabaseAdminClient: () => null,
  createSupabaseServerClient: async () => ({
    auth: {
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
  }),
}));

import { signupWithPassword } from "./auth-actions";

describe("signup role initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      retryAfterSeconds: 0,
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    mocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: {
          email: "new@example.test",
          id: "11111111-1111-4111-8111-111111111111",
          identities: [{ identity_id: "signup-identity" }],
        },
      },
      error: null,
    });
    mocks.persistRoles.mockImplementation(async ({ authUser, roles }) => ({
      email: authUser.email,
      id: authUser.id,
      roles,
      status: "ACTIVE",
    }));
  });

  it.each([
    ["buyer", ["BUYER"], "/buyer/profile"],
    ["seller", ["SELLER"], "/seller/properties"],
    ["both", ["BUYER", "SELLER"], "/buyer/profile"],
  ] as const)("persists %s before redirecting to email verification", async (role, roles, next) => {
    const form = new FormData();
    form.set("email", "new@example.test");
    form.set("name", "New User");
    form.set("password", "long-enough-password");
    form.set("role", role);

    await expect(signupWithPassword(form)).rejects.toThrow(
      `REDIRECT:/signup/verify?email=new%40example.test&next=${encodeURIComponent(next)}`,
    );

    expect(mocks.persistRoles).toHaveBeenCalledWith({
      authUser: expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
      }),
      name: "New User",
      roles: [...roles],
    });
    expect(mocks.persistRoles.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
    expect(mocks.ensureSellerAccess).not.toHaveBeenCalled();
  });

  it.each(["", "admin", "buyer and seller"])("rejects an invalid signup role %j before Auth", async (role) => {
    const form = new FormData();
    form.set("email", "new@example.test");
    form.set("name", "New User");
    form.set("password", "long-enough-password");
    form.set("role", role);

    await expect(signupWithPassword(form)).rejects.toThrow(
      "REDIRECT:/signup?status=invalid-role&step=role&email=new%40example.test",
    );

    expect(mocks.enforceLimit).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.persistRoles).not.toHaveBeenCalled();
  });
});
