import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ session: vi.fn(), enabled: vi.fn(), limit: vi.fn(), findProfile: vi.fn(), audits: vi.fn(), create: vi.fn(), raw: vi.fn(), transaction: vi.fn() }));
vi.mock("@liber/db", () => ({ prisma: { buyerProfile: { findUnique: db.findProfile }, adminAuditLog: { findMany: db.audits }, $transaction: db.transaction } }));
vi.mock("./session", () => ({ getSessionUser: db.session }));
vi.mock("./ceo-preview", () => ({ ceoPreviewToolsEnabled: db.enabled }));
vi.mock("./rate-limit", () => ({ checkRateLimit: db.limit }));

import { activeTestPreapprovalProfileIds, getSelfTestPreapprovalState, setSelfTestPreapproval, TEST_PREAPPROVAL_GRANT, TEST_PREAPPROVAL_REVOKE } from "./test-preapproval";

const actorId = "11111111-1111-4111-8111-111111111111";
const profileId = "own-buyer-profile";
const now = new Date("2026-10-06T12:00:00Z");
const grant = { action: TEST_PREAPPROVAL_GRANT, targetId: profileId, createdAt: now, metadata: { synthetic: true, evidenceVerified: false, expiresAt: "2026-10-07T12:00:00Z" } };
const client = { adminAuditLog: { findMany: db.audits } } as never;
function form(decision = "GRANT") { const f = new FormData(); f.set("decision", decision); f.set("confirmTest", "true"); return f; }

beforeEach(() => {
  vi.clearAllMocks();
  db.enabled.mockReturnValue(true);
  db.session.mockResolvedValue({ id: actorId, roles: ["ADMIN", "BUYER"] });
  db.limit.mockResolvedValue({ allowed: true });
  db.findProfile.mockResolvedValue({ id: profileId, visibilityStatus: "ACTIVE" });
  db.audits.mockResolvedValue([]);
  db.raw.mockResolvedValue([{ status: "ACTIVE", roles: ["ADMIN", "BUYER"] }]);
  db.transaction.mockImplementation(async (fn) => fn({ $queryRaw: db.raw, buyerProfile: { findUnique: db.findProfile }, adminAuditLog: { findMany: db.audits, create: db.create } }));
});

describe("admin self-test badge", () => {
  it.each([null, { id: actorId, roles: ["BUYER"] }])("denies non-admin callers %o", async (user) => {
    db.session.mockResolvedValue(user);
    expect((await setSelfTestPreapproval(form())).ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("denies a disabled workspace before mutations", async () => {
    db.enabled.mockReturnValue(false);
    expect((await setSelfTestPreapproval(form())).ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each(["INVALID", ""])("rejects invalid decision %s", async (decision) => {
    expect((await setSelfTestPreapproval(form(decision))).ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("requires explicit synthetic confirmation and enforces the rate limit", async () => {
    const f = form(); f.delete("confirmTest");
    expect((await setSelfTestPreapproval(f)).ok).toBe(false);
    db.limit.mockResolvedValue({ allowed: false });
    expect((await setSelfTestPreapproval(form())).ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each([{ status: "SUSPENDED", roles: ["ADMIN", "BUYER"] }, { status: "ACTIVE", roles: ["ADMIN"] }, { status: "ACTIVE", roles: ["BUYER"] }])("rechecks current locked database roles/status %o", async (owner) => {
    db.raw.mockResolvedValue([owner]);
    expect((await setSelfTestPreapproval(form())).ok).toBe(false);
    expect(db.create).not.toHaveBeenCalled();
  });
  it("ignores a submitted target and writes only a self-scoped audited marker", async () => {
    const f = form(); f.set("buyerProfileId", "someone-else");
    expect((await setSelfTestPreapproval(f)).ok).toBe(true);
    expect(db.findProfile).toHaveBeenCalledWith({ where: { userId: actorId }, select: { id: true, visibilityStatus: true } });
    const data = db.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ action: TEST_PREAPPROVAL_GRANT, actorUserId: actorId, targetType: "buyer_profile", targetId: profileId, metadata: { synthetic: true, evidenceVerified: false, source: "admin-self-test" } });
    expect(Date.parse(data.metadata.expiresAt) - data.createdAt.getTime()).toBe(86_400_000);
    expect(db.raw.mock.calls[0][0].join("")).toContain('FROM public."User"');
    expect(db.raw.mock.calls[1][0].join("")).toContain('FROM public."BuyerProfile"');
    expect(db.raw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  });
  it("does not create a buyer profile or bypass moderation", async () => {
    for (const profile of [null, { id: profileId, visibilityStatus: "HIDDEN" }, { id: profileId, visibilityStatus: "SUSPENDED" }]) {
      db.findProfile.mockResolvedValue(profile);
      expect((await setSelfTestPreapproval(form())).ok).toBe(false);
    }
    expect(db.create).not.toHaveBeenCalled();
  });
  it("preserves an active grant on repeated requests and audits revocation once", async () => {
    const createdAt = new Date();
    db.audits.mockResolvedValue([{ ...grant, createdAt, metadata: { ...grant.metadata, expiresAt: new Date(createdAt.getTime() + 86_400_000).toISOString() } }]);
    expect((await setSelfTestPreapproval(form())).ok).toBe(true);
    expect(db.create).not.toHaveBeenCalled();
    expect((await setSelfTestPreapproval(form("REVOKE"))).ok).toBe(true);
    expect(db.create.mock.calls[0][0].data.action).toBe(TEST_PREAPPROVAL_REVOKE);
    expect(db.create.mock.calls[0][0].data.metadata).toEqual({ source: "admin-self-test", synthetic: true, evidenceVerified: false });
    db.audits.mockResolvedValue([]); db.create.mockClear();
    expect((await setSelfTestPreapproval(form("REVOKE"))).ok).toBe(true);
    expect(db.create).not.toHaveBeenCalled();
  });
  it("returns only the current account's profile state", async () => {
    expect(await getSelfTestPreapprovalState()).toEqual({ enabled: true, hasBuyerRole: true, buyerProfileId: profileId, active: false });
    expect(db.findProfile.mock.calls[0][0].where).toEqual({ userId: actorId });
  });
});

describe("test badge read isolation", () => {
  it("scopes one marker query to the allowed profile IDs", async () => {
    db.audits.mockResolvedValue([grant]);
    expect(await activeTestPreapprovalProfileIds(client, [profileId], now)).toEqual(new Set([profileId]));
    expect(db.audits.mock.calls[0][0].where.targetId).toEqual({ in: [profileId] });
  });
  it.each([ { ...grant, action: TEST_PREAPPROVAL_REVOKE }, { ...grant, metadata: { ...grant.metadata, expiresAt: "bad" } }, { ...grant, metadata: { ...grant.metadata, expiresAt: now.toISOString() } }, { ...grant, metadata: { ...grant.metadata, evidenceVerified: true } }, { ...grant, metadata: { ...grant.metadata, expiresAt: "2026-11-01T12:00:00Z" } }, { ...grant, createdAt: new Date("2026-10-07T00:00:00Z") } ])("does not revive an older grant when latest state is invalid/revoked/expired", async (latest) => {
    db.audits.mockResolvedValue([latest, grant]);
    expect(await activeTestPreapprovalProfileIds(client, [profileId], now)).toEqual(new Set());
  });
  it("does not load or display markers with demo tools disabled", async () => {
    db.enabled.mockReturnValue(false);
    expect(await activeTestPreapprovalProfileIds(client, [profileId], now)).toEqual(new Set());
    expect(db.audits).not.toHaveBeenCalled();
  });
});
