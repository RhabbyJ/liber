import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../../../server/messaging/service", () => ({ listConversations: mocks.list }));

import { GET } from "./route";

describe("conversation list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ items: [], pageInfo: { hasMore: false, nextCursor: null } });
  });

  it("passes a bounded keyset query and returns private JSON", async () => {
    const response = await GET(request("?cursor=opaque&pageSize=50"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith({ cursor: "opaque", pageSize: 50 });
  });

  it("rejects an oversized page before invoking the service", async () => {
    const response = await GET(request("?pageSize=51"));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

function request(search = "") {
  return { nextUrl: new URL(`https://liber.example/api/conversations${search}`) } as never;
}
