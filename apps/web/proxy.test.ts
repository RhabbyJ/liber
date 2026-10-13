import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(), getUser: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
import { proxy } from "./proxy";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  createServerClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("page security boundary", () => {
  it("replaces supplied CSP and nonce with a fresh rendering nonce on each request", async () => {
    const first = await proxy(new NextRequest("https://liber.test/login", {
      headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src 'unsafe-inline'" },
    }));
    const second = await proxy(new NextRequest("https://liber.test/login"));
    const csp = first.headers.get("Content-Security-Policy")!;
    const scriptPolicy = csp.split(";").find((part) => part.trim().startsWith("script-src"))!;
    expect(scriptPolicy).toContain("'nonce-");
    expect(scriptPolicy).toContain("'strict-dynamic'");
    expect(scriptPolicy).not.toMatch(/unsafe-inline|unsafe-eval|attacker/);
    expect(second.headers.get("Content-Security-Policy")).not.toBe(csp);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe("attacker");
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("preserves refreshed or cleared Auth cookies when redirecting anonymous private pages", async () => {
    createServerClient.mockImplementation((_url, _key, options) => ({ auth: { getUser: async () => {
      options.cookies.setAll([{ name: "sb-test-auth-token", value: "", options: { maxAge: 0 } }]);
      return { data: { user: null }, error: null };
    } } }));
    const response = await proxy(new NextRequest("https://liber.test/messages"));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://liber.test/login?next=%2Fmessages");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("");
    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-");
  });

  it("does not contact Auth or emit personalized cookies on API requests", async () => {
    const response = await proxy(new NextRequest("https://liber.test/api/service-areas/search?q=Los"));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Cache-Control")).toBe(false);
  });
});
