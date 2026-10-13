import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ client: vi.fn(), signOut: vi.fn() }));
vi.mock("../../server/supabase", () => ({ createSupabaseServerClient: mocks.client }));
import { POST } from "./route";

describe("logout origin boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.client.mockResolvedValue({ auth: { signOut: mocks.signOut } });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it.each([{}, { origin: "https://attacker.test" }, { "sec-fetch-site": "same-site" }])("rejects missing or cross-origin browser signals before invalidating sessions: %j", async (headers) => {
    const response = await POST(new NextRequest("https://liber.test/logout", { method: "POST", headers: new Headers(headers as Record<string, string>) }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("retains same-origin sign-out and clears only Auth cookies", async () => {
    const response = await POST(new NextRequest("https://liber.test/logout", {
      method: "POST", headers: { origin: "https://liber.test", cookie: "sb-test-auth-token=fixture; preferred-view=map" },
    }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("https://liber.test/login?status=signed-out");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("");
    expect(response.cookies.get("preferred-view")).toBeUndefined();
  });
});
