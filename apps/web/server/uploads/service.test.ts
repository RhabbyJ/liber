import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  list: vi.fn(),
  rateLimit: vi.fn(),
  sign: vi.fn(),
  detectMime: vi.fn(),
  transaction: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("./signature", () => ({ detectRemoteMime: mocks.detectMime }));

vi.mock("@liber/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    uploadSession: {
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("../supabase", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove, createSignedUrl: mocks.sign }) },
  }),
}));

import { cleanupAbandonedUploads, createUploadSession, finalizeUploadSession } from "./service";

afterEach(() => vi.unstubAllEnvs());

const owner = { id: "11111111-1111-4111-8111-111111111111", roles: ["BUYER" as const] };
const expiredAt = new Date("2026-01-01T00:00:00.000Z");
const session = {
  bucket: "verification-documents",
  expectedMimeType: "application/pdf",
  expectedSizeBytes: 123,
  expiresAt: expiredAt,
  id: "upl_test",
  ownerUserId: owner.id,
  propertyId: null,
  purpose: "BUYER_VERIFICATION",
  status: "PENDING",
  storagePath: `${owner.id}/upl_test/document.pdf`,
};

describe("upload lifecycle concurrency", () => {
  let status: string;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 60, retryAfterSeconds: 0 });
    status = "PENDING";
    mocks.findMany.mockResolvedValue([session]);
    mocks.findFirst.mockResolvedValue(session);
    mocks.remove.mockResolvedValue({ error: null });
    mocks.update.mockImplementation(async ({ data }) => {
      status = data.status;
      return { ...session, status };
    });
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      const allowedStatuses = typeof where.status === "string" ? [where.status] : where.status.in;
      if (!allowedStatuses.includes(status)) return { count: 0 };
      if (where.expiresAt && expiredAt > where.expiresAt.lte) return { count: 0 };
      status = data.status;
      return { count: 1 };
    });
  });

  it("makes an abandoned session non-finalizable before deleting its object", async () => {
    mocks.remove.mockImplementation(async () => {
      expect(status).toBe("EXPIRED");
      return { error: null };
    });

    await expect(cleanupAbandonedUploads()).resolves.toEqual({ inspected: 1, removed: 1 });
    expect(status).toBe("CLEANED");
  });

  it("preserves accepted evidence if finalization commits after the cleanup scan", async () => {
    mocks.findMany.mockImplementation(async () => {
      status = "FINALIZED";
      return [session];
    });

    await expect(cleanupAbandonedUploads()).resolves.toEqual({ inspected: 1, removed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(status).toBe("FINALIZED");
  });

  it("keeps failed Storage removals expired and retryable", async () => {
    mocks.remove.mockResolvedValueOnce({ error: { message: "Storage unavailable" } });

    await expect(cleanupAbandonedUploads()).resolves.toEqual({ inspected: 1, removed: 0 });
    expect(status).toBe("EXPIRED");
    await expect(cleanupAbandonedUploads()).resolves.toEqual({ inspected: 1, removed: 1 });
    expect(status).toBe("CLEANED");
  });

  it("does not expire a finalized session from an earlier pending snapshot", async () => {
    mocks.findFirst.mockImplementation(async () => {
      status = "FINALIZED";
      return session;
    });

    await expect(finalizeUploadSession({ sessionId: session.id }, owner)).rejects.toThrow("expired");
    expect(status).toBe("FINALIZED");
  });

  it("does not reject a finalized session from a stale validation result", async () => {
    mocks.findFirst.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 60_000) });
    mocks.list.mockImplementation(async () => {
      status = "FINALIZED";
      return { data: [{ name: "document.pdf", metadata: { mimetype: "application/pdf", size: 456 } }], error: null };
    });

    await expect(finalizeUploadSession({ sessionId: session.id }, owner)).rejects.toThrow("authorized size");
    expect(status).toBe("FINALIZED");
  });

  it("still rejects a pending upload whose metadata is wrong", async () => {
    mocks.findFirst.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 60_000) });
    mocks.list.mockResolvedValue({
      data: [{ name: "document.pdf", metadata: { mimetype: "application/pdf", size: 456 } }],
      error: null,
    });

    await expect(finalizeUploadSession({ sessionId: session.id }, owner)).rejects.toThrow("authorized size");
    expect(status).toBe("REJECTED");
  });

  it("rate limits finalization before it can invoke Storage or load an upload", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, limit: 60, retryAfterSeconds: 25 });

    await expect(finalizeUploadSession({ sessionId: session.id }, owner))
      .rejects.toMatchObject({ status: 429, retryAfterSeconds: 25 });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects confidential uploads on production before issuing an upload token", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(createUploadSession({
      purpose: "BUYER_VERIFICATION", documentType: "IDENTITY", filename: "identity.pdf", sizeBytes: 123, mimeType: "application/pdf",
    }, owner)).rejects.toMatchObject({ status: 503 });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rejects production finalization even for a session created before the gate", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(finalizeUploadSession({ sessionId: session.id }, owner)).rejects.toMatchObject({ status: 503 });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { status: "SUSPENDED", roles: ["BUYER"] },
    { status: "ACTIVE", roles: ["SELLER"] },
  ])("rechecks current account authorization inside the finalization transaction: %j", async (currentOwner) => {
    mocks.findFirst.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 60_000) });
    mocks.list.mockResolvedValue({ data: [{ name: "document.pdf", metadata: { mimetype: "application/pdf", size: 123 } }], error: null });
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/object" }, error: null });
    mocks.detectMime.mockResolvedValue("application/pdf");
    const updateSession = vi.fn();
    mocks.transaction.mockImplementation(async (operation) => operation({
      $queryRaw: vi.fn().mockResolvedValue([currentOwner]),
      uploadSession: { update: updateSession },
    }));

    await expect(finalizeUploadSession({ sessionId: session.id }, owner)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(updateSession).not.toHaveBeenCalled();
  });
});
