import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSellerAccess: vi.fn(),
  enforceLimit: vi.fn(),
  headers: vi.fn(),
  persistRoles: vi.fn(),
  redirect: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  createAdminClient: vi.fn(),
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
  createSupabaseAdminClient: mocks.createAdminClient,
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
    vi.stubEnv("LIBER_AUTO_CONFIRM_SIGNUPS", "");
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
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["test", "production"],
    ["production", "production"],
    ["production", "preview"],
  ] as const)("requires email verification with stale auto-confirm flags in %s / %s", async (nodeEnvironment, vercelEnvironment) => {
    vi.stubEnv("NODE_ENV", nodeEnvironment);
    vi.stubEnv("VERCEL_ENV", vercelEnvironment);
    vi.stubEnv("SITE_URL", "https://liber.example.test");
    vi.stubEnv("LIBER_AUTO_CONFIRM_SIGNUPS", "true");
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    const form = new FormData();
    form.set("email", "new@example.test");
    form.set("name", "New User");
    form.set("password", "long-enough-password");
    form.set("role", "buyer");
    await expect(signupWithPassword(form)).rejects.toThrow("REDIRECT:/signup/verify?");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
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

  it.each([["name", 161], ["email", 255], ["password", 1025]] as const)("bounds the %s field before database quotas and Auth", async (field, length) => {
    const form = new FormData();
    form.set("email", "new@example.test");
    form.set("name", "New User");
    form.set("password", "long-enough-password");
    form.set("role", "buyer");
    form.set(field, "x".repeat(length));

    await expect(signupWithPassword(form)).rejects.toThrow("REDIRECT:/signup?status=missing-fields");
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.persistRoles).not.toHaveBeenCalled();
  });

  it.each(["Robert", "Robert <b>Jones</b>", "Robert Jones 2nd", "Robert ́Jones", `${"A".repeat(80)} ${"B".repeat(80)}`])(
    "rejects the invalid signup name %j before Auth",
    async (name) => {
      const form = new FormData();
      form.set("email", "new@example.test");
      form.set("name", name);
      form.set("password", "long-enough-password");
      form.set("role", "seller");

      await expect(signupWithPassword(form)).rejects.toThrow(
        "REDIRECT:/signup?status=missing-fields&role=seller&step=name&email=new%40example.test",
      );
      expect(mocks.enforceLimit).not.toHaveBeenCalled();
      expect(mocks.signUp).not.toHaveBeenCalled();
      expect(mocks.persistRoles).not.toHaveBeenCalled();
    },
  );

  it("sends only the normalized name to Auth metadata and the application user", async () => {
    const form = new FormData();
    form.set("email", "new@example.test");
    form.set("name", "  Julie \t PrivateSurname ");
    form.set("password", "long-enough-password");
    form.set("role", "both");

    await expect(signupWithPassword(form)).rejects.toThrow("REDIRECT:/signup/verify?");
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ data: { name: "Julie PrivateSurname", role: "both" } }),
    }));
    expect(mocks.persistRoles).toHaveBeenCalledWith(expect.objectContaining({ name: "Julie PrivateSurname" }));
  });
});
