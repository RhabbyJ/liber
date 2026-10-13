import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), activity: vi.fn(), mark: vi.fn() }));
vi.mock("../../../server/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("../../../server/notifications", () => ({ readNotificationActivity: mocks.activity, markNotificationsRead: mocks.mark }));

import { GET, PATCH } from "./route";

const user = { id: "trusted-session-owner", roles: ["BUYER"] };
const activity = { unreadCount: 1, latestInvite: { id: "cminvite", createdAt: "2026-10-06T12:00:00Z", read: false } };
function request(body: unknown = { all: true }, headers: Record<string, string> = {}) {
  return new NextRequest("https://liber.example/api/notifications", {
    method: "PATCH", headers: { host: "liber.example", origin: "https://liber.example", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function expectPrivate(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return response.json();
}

describe("private notification API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue(user);
    mocks.activity.mockResolvedValue(activity);
    mocks.mark.mockResolvedValue(activity);
  });

  it("requires authentication for reads and writes without invoking database services", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expectPrivate(await GET(), 401);
    await expectPrivate(await PATCH(request()), 401);
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("returns a minimal activity DTO for the trusted session and never marks read on GET", async () => {
    expect(await expectPrivate(await GET(), 200)).toEqual(activity);
    expect(mocks.activity).toHaveBeenCalledWith(user);
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("accepts a cuid notification ID, trims it, and passes only the trusted owner", async () => {
    expect(await expectPrivate(await PATCH(request({ notificationId: " cminvite " })), 200)).toEqual(activity);
    expect(mocks.mark).toHaveBeenCalledWith(user, { notificationId: "cminvite" });
  });

  it("accepts the explicit mark-all action", async () => {
    await expectPrivate(await PATCH(request({ all: true })), 200);
    expect(mocks.mark).toHaveBeenCalledWith(user, { all: true });
  });

  it.each([
    { notificationId: "cminvite", userId: "forged-user" }, { all: true, userId: "forged-user" },
    { notificationId: "cminvite", all: true }, { all: false }, {},
    { notificationId: " " }, { notificationId: "x".repeat(192) }, { notificationId: 2 },
    { ids: ["cminvite"] },
  ])("rejects forged ownership, mixed actions, and invalid update input: %j", async (body) => {
    await expectPrivate(await PATCH(request(body)), 400);
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example" }, { origin: "https://liber.example.evil" },
    { origin: "https://liber.example", "sec-fetch-site": "cross-site" }, { origin: "" },
  ])("rejects cross-site and absent-origin writes before resolving identity: %j", async (headers) => {
    await expectPrivate(await PATCH(request({ all: true }, headers)), 403);
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("accepts same-origin browser metadata when Origin is absent", async () => {
    await expectPrivate(await PATCH(request({ all: true }, { origin: "", "sec-fetch-site": "same-origin" })), 200);
  });

  it("rejects malformed JSON, unsupported content types, and oversized bodies", async () => {
    await expectPrivate(await PATCH(request("{")), 400);
    await expectPrivate(await PATCH(request({ all: true }, { "content-type": "text/plain" })), 415);
    await expectPrivate(await PATCH(request(`{"notificationId":"${"x".repeat(1100)}"}`)), 413);
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("returns a private generic outage response without leaking or logging exceptions", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getSessionUser.mockRejectedValueOnce(new Error("secret identity details"));
    const getBody = await expectPrivate(await GET(), 503);
    expect(JSON.stringify(getBody)).not.toContain("secret");
    mocks.mark.mockRejectedValueOnce(new Error("private database connection"));
    const patchBody = await expectPrivate(await PATCH(request()), 503);
    expect(JSON.stringify(patchBody)).not.toContain("database");
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
