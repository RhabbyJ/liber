import { afterEach, describe, expect, it, vi } from "vitest";
import { markAllNotificationsRead, markNotificationRead, NOTIFICATIONS_CHANGED_EVENT } from "./notification-client";

function stubBrowser(response: Promise<Response>) {
  const fetch = vi.fn(() => response);
  const target = new EventTarget();
  const changed = vi.fn();
  target.addEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", target);
  return { changed, fetch };
}

describe("notification read receipts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks one notification read with a same-origin keepalive PATCH and tells the bell", async () => {
    const { changed, fetch } = stubBrowser(Promise.resolve(new Response("{}", { status: 200 })));
    expect(await markNotificationRead("cmnotification")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({
      body: JSON.stringify({ notificationId: "cmnotification" }), credentials: "same-origin", keepalive: true, method: "PATCH",
    }));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("sends the explicit mark-all action", async () => {
    const { fetch } = stubBrowser(Promise.resolve(new Response("{}", { status: 200 })));
    await markAllNotificationsRead();
    expect(fetch).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({ body: JSON.stringify({ all: true }) }));
  });

  it("reports failures without announcing a change", async () => {
    for (const response of [Promise.resolve(new Response("{}", { status: 403 })), Promise.reject(new Error("offline"))]) {
      const { changed } = stubBrowser(response);
      expect(await markNotificationRead("cmnotification")).toBe(false);
      expect(changed).not.toHaveBeenCalled();
    }
  });
});
