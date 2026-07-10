import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSellerAccess: vi.fn(),
  establishSession: vi.fn(),
  exchangeCode: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
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
      verifyOtp: vi.fn(),
    },
  }),
}));

import { GET } from "./route";

describe("verified Auth callback role initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCode.mockResolvedValue({ error: null });
  });

  it("never grants an application role from user-editable Auth metadata", async () => {
    const authUser = {
      email: "buyer@example.test",
      id: "11111111-1111-4111-8111-111111111111",
      user_metadata: { role: "ADMIN" },
    };
    mocks.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.establishSession.mockResolvedValue({
      email: authUser.email,
      id: authUser.id,
      roles: [],
      status: "ACTIVE",
    });

    const response = await GET({
      url: "https://liber.example/auth/callback?code=verified&next=/seller/search",
    } as never);

    expect(mocks.establishSession).toHaveBeenCalledWith({
      authUser,
      roles: [],
    });
    expect(mocks.ensureSellerAccess).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://liber.example/onboarding/role?next=%2Fseller%2Fsearch",
    );
  });
});
