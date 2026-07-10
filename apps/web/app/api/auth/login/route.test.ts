import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceLimit: vi.fn(),
  getUser: vi.fn(),
  resolveIdentity: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
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
    const request = {
      formData: async () => form,
      headers: new Headers({ "x-real-ip": "203.0.113.8" }),
    } as Request;

    const response = await POST(request as never);

    expect(mocks.enforceLimit).toHaveBeenCalledTimes(2);
    expect(mocks.enforceLimit).toHaveBeenLastCalledWith({
      action: "recovery",
      email: "buyer@example.test",
      ip: "203.0.113.8",
    });
    expect(response.headers.get("location")).toBe("https://liber.example/login?status=rate-limited");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
