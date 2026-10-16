import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSellerAccess: vi.fn(),
  enforceLimit: vi.fn(),
  getUser: vi.fn(),
  resolveIdentity: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../../../server/access", () => ({
  ensureSellerAccessRequested: mocks.ensureSellerAccess,
}));

vi.mock("../../../../server/auth-identity", () => ({
  resolveAuthIdentity: mocks.resolveIdentity,
}));

vi.mock("../../../../server/auth-rate-limit", () => ({
  enforceSharedAuthRateLimit: mocks.enforceLimit,
}));

vi.mock("../../../../server/request-origin", () => ({
  isRequestSameOrigin: () => true,
  requestUrl: (_request: Request, path: string) => new URL(path, "https://liber.example"),
}));

vi.mock("../../../../server/supabase", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signIn,
      signOut: mocks.signOut,
    },
  }),
}));

import { POST } from "./route";

describe("password login recovery throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceLimit
      .mockResolvedValueOnce({ allowed: true, limit: 10, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, limit: 3, retryAfterSeconds: 60 });
    mocks.signIn.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: "buyer@example.test",
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
    mocks.resolveIdentity.mockResolvedValue({ kind: "collision" });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("uses the denied recovery budget instead of exposing the recovery redirect", async () => {
    const form = new FormData();
    form.set("email", "buyer@example.test");
    form.set("password", "not-a-real-password");
    const request = new Request("https://liber.example/api/auth/login", { method: "POST", body: form });

    const response = await POST(request as never);

    expect(mocks.enforceLimit).toHaveBeenCalledTimes(2);
    expect(mocks.enforceLimit).toHaveBeenLastCalledWith({
      action: "recovery",
      email: "buyer@example.test",
      ip: "unknown-ip",
    });
    expect(response.headers.get("location")).toBe("https://liber.example/login?status=rate-limited");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("repairs a missing seller-access request after successful login", async () => {
    mocks.enforceLimit.mockReset();
    mocks.enforceLimit.mockResolvedValue({ allowed: true, limit: 10, retryAfterSeconds: 0 });
    mocks.resolveIdentity.mockResolvedValue({
      kind: "linked",
      user: {
        email: "seller@example.test",
        id: "11111111-1111-4111-8111-111111111111",
        roles: ["SELLER"],
        status: "ACTIVE",
      },
    });

    const form = new FormData();
    form.set("email", "seller@example.test");
    form.set("password", "not-a-real-password");
    const request = new Request("https://liber.example/api/auth/login", { method: "POST", body: form });

    const response = await POST(request as never);

    expect(mocks.ensureSellerAccess).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(response.headers.get("location")).toBe("https://liber.example/seller/properties");
  });

  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/%09/evil.example", "/.//evil.example"])(
    "sends a successful login with next=%j to the user's workspace, not off-site",
    async (next) => {
      mocks.enforceLimit.mockReset();
      mocks.enforceLimit.mockResolvedValue({ allowed: true, limit: 10, retryAfterSeconds: 0 });
      mocks.resolveIdentity.mockResolvedValue({
        kind: "linked",
        user: { email: "buyer@example.test", id: "11111111-1111-4111-8111-111111111111", roles: ["BUYER"], status: "ACTIVE" },
      });

      const response = await POST(new Request("https://liber.example/api/auth/login", {
        method: "POST", body: new URLSearchParams({ email: "buyer@example.test", next, password: "not-a-real-password" }),
      }) as never);

      expect(response.headers.get("location")).toBe("https://liber.example/buyer/profile");
    },
  );

  it("does not reflect a hostile next into the retry link", async () => {
    const response = await POST(new Request("https://liber.example/api/auth/login", {
      method: "POST", body: new URLSearchParams({ email: "buyer@example.test", next: "/\t/evil.example", password: "" }),
    }) as never);

    expect(response.headers.get("location")).toBe(
      "https://liber.example/login?status=missing-credentials&email=buyer%40example.test&next=%2F",
    );
  });

  it("rejects a streamed oversized form before database quotas or Auth", async () => {
    const response = await POST(new Request("https://liber.example/api/auth/login", {
      method: "POST", body: new URLSearchParams({ email: "x".repeat(20 * 1024), password: "private" }),
    }) as never);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart without an unhandled server error", async () => {
    const response = await POST(new Request("https://liber.example/api/auth/login", {
      method: "POST", body: "not a form", headers: { "content-type": "multipart/form-data" },
    }) as never);
    expect(response.status).toBe(400);
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
  });

  it("bounds reflected credential fields before quotas and redirects", async () => {
    const response = await POST(new Request("https://liber.example/api/auth/login", {
      method: "POST", body: new URLSearchParams({ email: "x".repeat(255), password: "private" }),
    }) as never);
    expect(response.headers.get("location")).toBe("https://liber.example/login?status=invalid-login");
    expect(mocks.enforceLimit).not.toHaveBeenCalled();
  });

  it("fails closed without exposing limiter diagnostics", async () => {
    mocks.enforceLimit.mockReset();
    mocks.enforceLimit.mockRejectedValue(new Error("private database connection diagnostic"));
    const response = await POST(new Request("https://liber.example/api/auth/login", {
      method: "POST", body: new URLSearchParams({ email: "buyer@example.test", password: "private" }),
    }) as never);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
