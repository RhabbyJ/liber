import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), sameOrigin: true }));
vi.mock("../../../../../server/messaging/tours", () => ({ getConversationTour: mocks.read, mutateConversationTour: mocks.mutate }));
vi.mock("../../../../../server/request-origin", () => ({ isRequestSameOrigin: () => mocks.sameOrigin }));
import { GET, POST } from "./route";
import { MessagingError } from "../../../../../server/messaging/errors";
const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const body = { action: "CONFIRM", expectedRevision: 1, clientActionId: "019f62c5-1c07-4a62-9f9a-8302778aa012" };
const context = () => ({ params: Promise.resolve({ conversationId }) });
function request(payload: unknown, contentType = "application/json") { return new Request("https://liber.example/api/conversations/tour", { method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify(payload) }) as never; }

describe("tour HTTP boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.sameOrigin = true; mocks.mutate.mockResolvedValue({ canSchedule: true, schedule: null }); });
  it("requires same origin before writes and disallows caller-supplied identities", async () => {
    mocks.sameOrigin = false;
    expect((await POST(request(body), context())).status).toBe(403);
    mocks.sameOrigin = true;
    expect((await POST(request({ ...body, userId: "someone-else" }), context())).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("bounds JSON and returns a private result", async () => {
    expect((await POST(request(body, "text/plain"), context())).status).toBe(400);
    expect((await POST(request({ ...body, unknown: "x".repeat(17_000) }), context())).status).toBe(413);
    const response = await POST(request(body), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.mutate).toHaveBeenCalledWith(conversationId, body);
  });
  it("returns private generic authorization failures", async () => {
    mocks.read.mockRejectedValue(new MessagingError("NOT_FOUND", "Private identity", 404));
    const response = await GET(new Request("https://liber.example") as never, context());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("Private identity");
  });
});
