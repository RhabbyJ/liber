import type { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSellerAccess: vi.fn(),
  establishSession: vi.fn(),
  exchangeCode: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("../../../server/access", () => ({
  ensureSellerAccessRequested: mocks.ensureSellerAccess,
}));

vi.mock("../../../server/auth-identity", () => ({
  AuthIdentityLinkError: class AuthIdentityLinkError extends Error {},
  establishVerifiedAuthSession: mocks.establishSession,
}));

vi.mock("../../../server/auth-rate-limit", () => ({
  enforceSharedAuthRateLimit: vi.fn(),
}));

vi.mock("../../../server/supabase", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCode,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      verifyOtp: mocks.verifyOtp,
    },
  }),
}));

import { isValidPasswordRecoveryMarker, PASSWORD_RECOVERY_COOKIE } from "../../../server/password-recovery";
import { GET } from "./route";

const authUser = { email: "buyer@example.test", id: "11111111-1111-4111-8111-111111111111" };

function callback(query: string) {
  return GET({ url: `https://liber.example/auth/callback?${query}` } as never);
}

describe("verified Auth callback role initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCode.mockResolvedValue({ data: { redirectType: null, session: {}, user: authUser }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { session: {}, user: authUser }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.establishSession.mockResolvedValue({ ...authUser, roles: ["BUYER"], status: "ACTIVE" });
  });

  it("never grants an application role from user-editable Auth metadata", async () => {
    const metadataUser = { ...authUser, user_metadata: { role: "ADMIN" } };
    mocks.getUser.mockResolvedValue({ data: { user: metadataUser }, error: null });

    const response = await callback("code=verified&next=/buyer/profile");

    expect(mocks.establishSession).toHaveBeenCalledWith(metadataUser);
    expect(mocks.ensureSellerAccess).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://liber.example/buyer/profile");
  });

  it.each(["/%09/evil.example", "/%0A/evil.example", "/%0D/evil.example", "%2F%2Fevil.example", "/%5Cevil.example", "/%2509/evil.example"])(
    "keeps a confirmation link with next=%s on this site",
    async (encodedNext) => {
      const response = await callback(`code=verified&next=${encodedNext}`);

      expect(response.headers.get("location")).toBe("https://liber.example/buyer/profile");
    },
  );
});

describe("password recovery callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCode.mockResolvedValue({ data: { redirectType: null, session: {}, user: authUser }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { session: {}, user: authUser }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.establishSession.mockResolvedValue({ ...authUser, roles: ["SELLER"], status: "ACTIVE" });
  });

  function expectRecoveryMarker(response: NextResponse) {
    const marker = response.cookies.get(PASSWORD_RECOVERY_COOKIE);
    expect(marker).toMatchObject({ httpOnly: true, path: "/reset-password" });
    expect(isValidPasswordRecoveryMarker(marker?.value, authUser.id)).toBe(true);
  }

  it("opens the reset page for a PKCE link that this browser requested as a recovery", async () => {
    mocks.exchangeCode.mockResolvedValue({ data: { redirectType: "recovery", session: {}, user: authUser }, error: null });

    const response = await callback("code=recovery-code&next=%2Freset-password");

    expect(response.headers.get("location")).toBe("https://liber.example/reset-password");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expectRecoveryMarker(response);
    expect(mocks.establishSession).toHaveBeenCalledWith(authUser);
    expect(mocks.ensureSellerAccess).toHaveBeenCalledWith(authUser.id);
  });

  it("opens the reset page for a verified recovery token hash", async () => {
    const response = await callback("token_hash=hash&type=recovery&next=%2Freset-password");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "recovery" });
    expect(response.headers.get("location")).toBe("https://liber.example/reset-password");
    expectRecoveryMarker(response);
  });

  it("ignores next=/reset-password on a link that is not a recovery", async () => {
    const response = await callback("code=signup-code&next=%2Freset-password");

    expect(response.headers.get("location")).toBe("https://liber.example/seller/properties");
    expect(response.cookies.get(PASSWORD_RECOVERY_COOKIE)).toBeUndefined();
  });

  it("does not open the reset page for a suspended identity", async () => {
    const { AuthIdentityLinkError } = await import("../../../server/auth-identity");
    // The mocked class ignores its argument; the route reads `code`.
    const inactive = Object.assign(new AuthIdentityLinkError("inactive"), { code: "inactive" });
    mocks.establishSession.mockRejectedValue(inactive);
    mocks.exchangeCode.mockResolvedValue({ data: { redirectType: "recovery", session: {}, user: authUser }, error: null });

    const response = await callback("code=recovery-code&next=%2Freset-password");

    expect(mocks.signOut).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://liber.example/login?status=account-unavailable");
  });

  it.each([
    ["an expired recovery code", "code=expired&next=%2Freset-password", "/forgot-password?status=link-expired"],
    ["an expired recovery token", "token_hash=hash&type=recovery&next=%2Freset-password", "/forgot-password?status=link-expired"],
    ["a Supabase error redirect for a reset", "error=access_denied&error_code=otp_expired&next=%2Freset-password", "/forgot-password?status=link-expired"],
    ["an expired signup confirmation", "code=expired&next=%2Fbuyer%2Fprofile", "/login?status=auth-error"],
  ])("explains %s on the matching page", async (_label, query, location) => {
    mocks.exchangeCode.mockResolvedValue({ data: { session: null, user: null }, error: { code: "otp_expired" } });
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { code: "otp_expired" } });

    const response = await callback(query);

    expect(response.headers.get("location")).toBe(`https://liber.example${location}`);
  });

  it("rejects an unknown one-time-password type without calling Supabase", async () => {
    const response = await callback("token_hash=hash&type=sms&next=%2Fbuyer%2Fprofile");

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://liber.example/login?status=auth-error");
  });
});
