import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { negotiation, revision } from "../../../../../../components/loi/loi-test-fixtures.test-helper";
import { LoiError } from "../../../../../../server/loi/errors";

const mocks = vi.hoisted(() => ({ read: vi.fn(), render: vi.fn(), rate: vi.fn() }));
vi.mock("../../../../../../server/loi/service", () => ({ getLoiNegotiation: mocks.read }));
vi.mock("../../../../../../server/shared-rate-limit", () => ({ consumeSharedRateLimit: mocks.rate }));
vi.mock("../../../../../../server/loi/pdf", async (original) => ({ ...await original<object>(), createAlignedLoiPdf: mocks.render }));
import { GET } from "./route";

const id = "20000000-0000-4000-8000-000000000000";
const request = () => GET(new NextRequest(`https://liber.example/api/loi/negotiations/${id}/pdf`), { params: Promise.resolve({ negotiationId: id }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(negotiation({ status: "TERMS_ALIGNED", revisions: [revision(1)] }));
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.render.mockResolvedValue(new TextEncoder().encode("%PDF-1.7\n"));
});
describe("LOI PDF route", () => {
  it.each(["BUYER", "SELLER"] as const)("serves an authorized aligned snapshot to %s as a private attachment", async (viewerRole) => {
    mocks.read.mockResolvedValue(negotiation({ status: "TERMS_ALIGNED", viewerRole, revisions: [revision(1)] }));
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain(`Liber-LOI-${id}-v1.pdf`);
    expect(mocks.read).toHaveBeenCalledWith(id);
  });
  it.each([401, 404])("does not render when participant authorization fails with %s", async (status) => {
    mocks.read.mockRejectedValue(new LoiError(status === 401 ? "AUTHENTICATION_REQUIRED" : "NOT_FOUND", "Private", status));
    expect((await request()).status).toBe(status);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("refuses a negotiation that has not aligned", async () => {
    mocks.read.mockResolvedValue(negotiation({ revisions: [revision(1)] }));
    expect((await request()).status).toBe(409);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("refuses a missing final revision before rate limiting or rendering", async () => {
    mocks.read.mockResolvedValue(negotiation({ status: "TERMS_ALIGNED", currentSequence: 2, revisions: [revision(1)] }));
    expect((await request()).status).toBe(409);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("rate limits repeated exports after authorization", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await request()).status).toBe(429);
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
