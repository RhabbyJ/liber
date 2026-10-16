import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearRecovery: vi.fn(),
  enforceLimit: vi.fn(),
  getSessionUser: vi.fn(),
  hasRecovery: vi.fn(),
  redirect: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./access", () => ({ ensureSellerAccessRequested: vi.fn() }));
vi.mock("./auth-identity", () => ({
  AuthIdentityLinkError: class AuthIdentityLinkError extends Error {},
  persistUserRolesForAuthIdentity: vi.fn(),
  signupStatusForAuthFailure: vi.fn(),
}));
vi.mock("./auth-rate-limit", () => ({ enforceSharedAuthRateLimit: mocks.enforceLimit }));
vi.mock("./password-recovery", () => ({
  PASSWORD_RESET_PATH: "/reset-password",
  clearPasswordRecovery: mocks.clearRecovery,
  hasPasswordRecoveryFor: mocks.hasRecovery,
}));
vi.mock("./rate-limit", () => ({ clientIpFromHeaders: () => "203.0.113.10" }));
vi.mock("./session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("./supabase", () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
    },
  }),
}));

import { changePassword, completePasswordReset, requestPasswordReset } from "./auth-actions";

const seller = {
  email: "seller@example.test",
  id: "11111111-1111-4111-8111-111111111111",
  roles: ["SELLER"],
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://liber.example.test");
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  mocks.enforceLimit.mockResolvedValue({ allowed: true, limit: 3, retryAfterSeconds: 0 });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mocks.getSessionUser.mockResolvedValue(seller);
  mocks.hasRecovery.mockResolvedValue(true);
  mocks.updateUser.mockResolvedValue({ data: { user: { id: seller.id } }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: { session: {}, user: { id: seller.id } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("password reset request", () => {
  it("emails a recovery link that returns through the Auth callback to the reset page", async () => {
    await expect(requestPasswordReset(form({ email: " seller@example.test " }))).rejects.toThrow(
      "REDIRECT:/forgot-password?status=sent",
    );

    expect(mocks.enforceLimit).toHaveBeenCalledWith({
      action: "reset",
      email: "seller@example.test",
      ip: "203.0.113.10",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("seller@example.test", {
      redirectTo: "https://liber.example.test/auth/callback?next=%2Freset-password",
    });
  });

  it.each([
    { code: "user_not_found", status: 404 },
    { code: "over_email_send_rate_limit", status: 429 },
    { code: "unexpected_failure", status: 500 },
  ])("shows the same confirmation when Supabase answers $code, and logs no address", async (failure) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.resetPasswordForEmail.mockResolvedValue({ data: null, error: { ...failure, message: "seller@example.test" } });

    await expect(requestPasswordReset(form({ email: "seller@example.test" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?status=sent",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("seller@example.test");
    log.mockRestore();
  });

  it("ignores a submitted next value; the link always targets the reset page", async () => {
    await expect(requestPasswordReset(form({ email: "seller@example.test", next: "//evil.example" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?status=sent",
    );
    expect(mocks.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe(
      "https://liber.example.test/auth/callback?next=%2Freset-password",
    );
  });

  it("stops at the shared limiter before Supabase sends anything", async () => {
    mocks.enforceLimit.mockResolvedValue({ allowed: false, limit: 3, retryAfterSeconds: 600 });

    await expect(requestPasswordReset(form({ email: "seller@example.test" }))).rejects.toThrow(
      "REDIRECT:/forgot-password?status=rate-limited",
    );
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it.each(["", "not-an-email", `${"a".repeat(250)}@example.test`])("rejects the address %j without spending the limiter", async (email) => {
    await expect(requestPasswordReset(form({ email }))).rejects.toThrow("REDIRECT:/forgot-password?status=invalid-email");
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("completing a password reset", () => {
  it("sets the new password, ends other sessions, clears the marker, and opens the workspace", async () => {
    await expect(completePasswordReset(form({ password: "  a-new-long-password  " }))).rejects.toThrow(
      "REDIRECT:/seller/properties",
    );

    expect(mocks.hasRecovery).toHaveBeenCalledWith(seller.id);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-new-long-password" });
    expect(mocks.clearRecovery).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it.each([
    ["no session", () => mocks.getSessionUser.mockResolvedValue(null)],
    ["a session without a verified recovery link", () => mocks.hasRecovery.mockResolvedValue(false)],
  ])("refuses %s", async (_label, arrange) => {
    arrange();
    await expect(completePasswordReset(form({ password: "a-new-long-password" }))).rejects.toThrow(
      "REDIRECT:/reset-password",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.clearRecovery).not.toHaveBeenCalled();
  });

  it("applies the signup length rule after trimming", async () => {
    await expect(completePasswordReset(form({ password: "   short-pass   " }))).rejects.toThrow(
      "REDIRECT:/reset-password?status=too-short",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("keeps the recovery marker when Supabase rejects the password", async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: { code: "same_password", status: 422 } });

    await expect(completePasswordReset(form({ password: "a-new-long-password" }))).rejects.toThrow(
      "REDIRECT:/reset-password?status=same-password",
    );
    expect(mocks.clearRecovery).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

describe("profile password change", () => {
  const change = (values: Record<string, string> = {}) =>
    changePassword(form({ currentPassword: "the-current-password", newPassword: "a-new-long-password", ...values }));

  it("checks the current password on the login budget, then updates and ends other sessions", async () => {
    await expect(change()).rejects.toThrow("REDIRECT:/profile?status=password-updated#password");

    expect(mocks.enforceLimit).toHaveBeenCalledWith({ action: "login", email: seller.email, ip: "203.0.113.10" });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: seller.email, password: "the-current-password" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-new-long-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
  });

  it("sends a signed-out visitor to log in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(change()).rejects.toThrow("REDIRECT:/login?next=%2Fprofile");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not change anything when the current password is wrong", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "invalid_credentials", status: 400 },
    });

    await expect(change()).rejects.toThrow("REDIRECT:/profile?status=wrong-password#password");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("stops at the login limiter before checking the password", async () => {
    mocks.enforceLimit.mockResolvedValue({ allowed: false, limit: 10, retryAfterSeconds: 60 });

    await expect(change()).rejects.toThrow("REDIRECT:/profile?status=rate-limited#password");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ currentPassword: "" }, "missing-current"],
    [{ newPassword: "too-short" }, "too-short"],
    [{ newPassword: "x".repeat(1025) }, "too-long"],
  ])("validates %j before spending the limiter", async (values, status) => {
    await expect(change(values)).rejects.toThrow(`REDIRECT:/profile?status=${status}#password`);
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs out instead of continuing as a different Auth identity", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: "22222222-2222-4222-8222-222222222222" } },
      error: null,
    });

    await expect(change()).rejects.toThrow("REDIRECT:/login?status=account-unavailable");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
