import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), document: vi.fn(), image: vi.fn(), query: vi.fn(), sign: vi.fn(), audit: vi.fn(), rate: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: {
  verificationDocument: { findUnique: mocks.document },
  propertyImage: { findUnique: mocks.image },
  adminAuditLog: { create: mocks.audit },
  $queryRaw: mocks.query,
} }));
vi.mock("../session", () => ({ getSessionUser: mocks.user }));
vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("../supabase", () => ({ createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));

import { GET as readDocument } from "../../app/api/admin/documents/[documentId]/route";
import { GET as readImage } from "../../app/api/property-images/[imageId]/route";

const documentRequest = () => readDocument(new Request("https://liber.example.test/api/admin/documents/doc_test"), {
  params: Promise.resolve({ documentId: "doc_test" }),
});
const imageRequest = () => readImage(new Request("https://liber.example.test/api/property-images/image_test"), {
  params: Promise.resolve({ imageId: "image_test" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  mocks.user.mockResolvedValue({ id: "admin-fixture", roles: ["ADMIN"] });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.document.mockResolvedValue({
    documentType: "IDENTITY", reviewStatus: "PENDING", storageBucket: "verification-documents", storagePath: "private/identity.pdf",
  });
  mocks.image.mockResolvedValue({ storagePath: "property/image.png" });
  mocks.query.mockResolvedValue([{ allowed: true }]);
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/signed?token=fixture" }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authorized private document access", () => {
  it("does not expose or sign documents for unrelated authenticated users", async () => {
    mocks.user.mockResolvedValue({ id: "buyer-fixture", roles: ["BUYER"] });
    const response = await documentRequest();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.document).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("blocks unscanned production document access even for administrators", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await documentRequest();
    expect(response.status).toBe(503);
    expect(mocks.document).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rejects ownership evidence from an obsolete property identity", async () => {
    mocks.document.mockResolvedValue({
      documentType: "OWNERSHIP", reviewStatus: "PENDING", storageBucket: "verification-documents", storagePath: "private/identity.pdf",
      propertyIdentityVersion: 1,
      property: { identityVersion: 2, authorityAttestedIdentityVersion: 2, authorityAttestedByUserId: "owner", ownerUserId: "owner" },
    });
    const response = await documentRequest();
    expect(response.status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("signs one authorized document for 60 seconds and records access without a path/token", async () => {
    const response = await documentRequest();
    expect(response.status).toBe(302);
    expect(mocks.sign).toHaveBeenCalledWith("private/identity.pdf", 60);
    expect(mocks.audit.mock.calls[0][0]).toEqual({ data: {
      action: "document_accessed", actorUserId: "admin-fixture", targetId: "doc_test", targetType: "verification_document",
    } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("bounds signing work and preserves Retry-After", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    const response = await documentRequest();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.document).not.toHaveBeenCalled();
  });
});

describe("private property image access", () => {
  it("checks the current canonical database authorization before signing", async () => {
    mocks.query.mockResolvedValue([{ allowed: false }]);
    const response = await imageRequest();
    expect(response.status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("property/image.png");
  });

  it("cannot turn signing failures into leaked provider details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sign.mockRejectedValue(new Error("private/image.png?token=sensitive-token"));
    const response = await imageRequest();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive-token");
    expect(log.mock.calls.flat().join(" ")).not.toContain("sensitive-token");
  });

  it("rate limits repeated signing before database lookups", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const response = await imageRequest();
    expect(response.status).toBe(429);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
