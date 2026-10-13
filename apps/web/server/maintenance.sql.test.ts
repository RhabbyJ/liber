import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  tx: {
    $queryRaw: vi.fn(),
    notification: { createMany: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    loiNegotiation: { update: vi.fn() },
    loiEvent: { create: vi.fn() },
    loiDraft: { deleteMany: vi.fn() },
    emailOutbox: { updateMany: vi.fn() },
  },
}));
vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
import { expireMarketplaceState, MAINTENANCE_BATCH_SIZE } from "./maintenance";

const now = new Date("2026-09-21T12:00:00.000Z");
let database: PGlite;

describe("bounded expiry in isolated PostgreSQL", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TYPE "LoiNegotiationStatus" AS ENUM (
        'AWAITING_BUYER_SUBMISSION', 'AWAITING_BUYER_RESPONSE', 'AWAITING_SELLER_RESPONSE', 'EXPIRED', 'READ_ONLY'
      );
      CREATE TABLE "User" (id text PRIMARY KEY, status text, roles text[]);
      CREATE TABLE "BuyerProfile" (id text PRIMARY KEY, "userId" text, "visibilityStatus" text);
      CREATE TABLE "BuyerBadge" (
        id text PRIMARY KEY, "buyerProfileId" text, "badgeType" text, status text,
        "expiresAt" timestamptz, "updatedAt" timestamptz
      );
      CREATE TABLE "Invite" (
        id text PRIMARY KEY, "buyerProfileId" text, "sellerId" text, "propertyId" text, title text,
        status text, "expiresAt" timestamptz, "updatedAt" timestamptz, "propertyIdentityVersion" integer
      );
      CREATE TABLE "Conversation" (id text PRIMARY KEY, status text);
      CREATE TABLE "SellerProperty" (
        id text PRIMARY KEY, "identityVersion" integer, status text, "ownershipVerificationStatus" text,
        "flaggedForReviewAt" timestamptz, "ownerUserId" text, "authorityAttestedIdentityVersion" integer
      );
      CREATE TABLE "SellerAccess" ("userId" text PRIMARY KEY, status text);
      CREATE TABLE "UserBlock" ("blockerUserId" text, "blockedUserId" text);
      CREATE TABLE "LoiNegotiation" (
        id text PRIMARY KEY, "buyerUserId" text, "sellerUserId" text, "currentRevisionId" text,
        "inviteId" text, "conversationId" text, "propertyId" text, "propertyIdentityVersion" integer,
        status "LoiNegotiationStatus"
      );
      CREATE TABLE "LoiRevision" (id text PRIMARY KEY, "responseDeadline" timestamptz);
      CREATE TABLE "EmailOutbox" (
        id text PRIMARY KEY, status text, "sentAt" timestamptz, "updatedAt" timestamptz,
        payload jsonb NOT NULL, subject text, "to" text NOT NULL
      );
      INSERT INTO "BuyerProfile" VALUES ('buyer-profile', 'buyer-user', 'ACTIVE');
    `);
  }, 30_000);

  beforeEach(async () => {
    vi.resetAllMocks();
    await database.exec("BEGIN");
    mocks.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((text, segment, index) => text + (index ? `$${index}` : "") + segment, "");
      return (await database.query(sql, values)).rows;
    });
    mocks.tx.loiNegotiation.update.mockImplementation(async ({ where, data }) => {
      await database.query('UPDATE "LoiNegotiation" SET status = $1 WHERE id = $2', [data.status, where.id]);
    });
    mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.tx) => Promise<unknown>) => {
      await database.exec("SAVEPOINT maintenance_batch");
      try {
        const result = await run(mocks.tx);
        await database.exec("RELEASE SAVEPOINT maintenance_batch");
        return result;
      } catch (error) {
        await database.exec("ROLLBACK TO SAVEPOINT maintenance_batch");
        throw error;
      }
    });
  });
  afterEach(async () => database.exec("ROLLBACK"));
  afterAll(async () => database.close());

  it("drains a backlog in bounded batches without repeating notifications", async () => {
    await database.exec(`
      INSERT INTO "BuyerBadge" (id, "buyerProfileId", "badgeType", status, "expiresAt")
      SELECT 'badge-' || value, 'buyer-profile', 'VERIFIED_FUNDS', 'ACTIVE', '2026-09-01'
      FROM generate_series(1, ${MAINTENANCE_BATCH_SIZE + 1}) value;
      INSERT INTO "Invite" (id, "buyerProfileId", "sellerId", "propertyId", title, status, "expiresAt")
      SELECT 'invite-' || value, 'buyer-profile', 'seller-user', 'property', 'Private invitation', 'SENT', '2026-09-01'
      FROM generate_series(1, ${MAINTENANCE_BATCH_SIZE + 1}) value;
    `);
    expect(await expireMarketplaceState(now)).toMatchObject({
      badgesExpired: MAINTENANCE_BATCH_SIZE, invitesExpired: MAINTENANCE_BATCH_SIZE, hasMore: true,
    });
    expect(await expireMarketplaceState(now)).toMatchObject({ badgesExpired: 1, invitesExpired: 1, hasMore: false });
    expect(await expireMarketplaceState(now)).toMatchObject({ badgesExpired: 0, invitesExpired: 0, hasMore: false });
    const notices = mocks.tx.notification.createMany.mock.calls.flatMap(([arg]) => arg.data);
    expect(notices).toHaveLength((MAINTENANCE_BATCH_SIZE + 1) * 3);
    expect(new Set(notices.map((notice) => `${notice.type}:${notice.metadata.badgeId ?? notice.metadata.inviteId}:${notice.userId}`)).size)
      .toBe(notices.length);
  });

  it("preserves accepted invites, current deadlines, and revoked badges", async () => {
    await database.exec(`
      INSERT INTO "Invite" (id, "buyerProfileId", status, "expiresAt") VALUES
        ('accepted', 'buyer-profile', 'ACCEPTED', '2026-09-01'),
        ('future', 'buyer-profile', 'SENT', '2026-09-22');
      INSERT INTO "BuyerBadge" (id, "buyerProfileId", status, "expiresAt") VALUES
        ('revoked', 'buyer-profile', 'REVOKED', '2026-09-01'),
        ('future', 'buyer-profile', 'ACTIVE', '2026-09-22');
    `);
    expect(await expireMarketplaceState(now)).toMatchObject({ badgesExpired: 0, invitesExpired: 0 });
    expect(mocks.tx.notification.createMany).not.toHaveBeenCalled();
    expect((await database.query('SELECT status FROM "Invite" WHERE id = $1', ["accepted"])).rows)
      .toEqual([{ status: "ACCEPTED" }]);
  });

  it("rolls transitions back when recording their notifications fails", async () => {
    await database.exec(`
      INSERT INTO "BuyerBadge" (id, "buyerProfileId", "badgeType", status, "expiresAt")
      VALUES ('badge', 'buyer-profile', 'VERIFIED_FUNDS', 'ACTIVE', '2026-09-01');
    `);
    mocks.tx.notification.createMany.mockRejectedValueOnce(new Error("notification unavailable"));
    await expect(expireMarketplaceState(now)).rejects.toThrow("notification unavailable");
    expect((await database.query('SELECT status FROM "BuyerBadge" WHERE id = $1', ["badge"])).rows)
      .toEqual([{ status: "ACTIVE" }]);
    expect(await expireMarketplaceState(now)).toMatchObject({ badgesExpired: 1 });
  });

  it("minimizes only old delivered email and does not repeatedly rewrite cleared rows", async () => {
    await database.exec(`
      INSERT INTO "EmailOutbox" (id, status, "sentAt", payload, subject, "to")
      SELECT 'old-' || value, 'SENT', '2026-08-01', '{"private":"fixture"}', 'Private subject', 'fixture@example.test'
      FROM generate_series(1, ${MAINTENANCE_BATCH_SIZE + 1}) value;
      INSERT INTO "EmailOutbox" (id, status, "sentAt", payload, subject, "to") VALUES
        ('already-cleared', 'SENT', '2026-08-01', '{}', NULL, 'redacted'),
        ('recent', 'SENT', '2026-09-20', '{}', 'Recent', 'fixture@example.test'),
        ('pending', 'PENDING', '2026-08-01', '{}', 'Pending', 'fixture@example.test');
    `);
    expect(await expireMarketplaceState(now)).toMatchObject({ outboxPayloadsMinimized: MAINTENANCE_BATCH_SIZE, hasMore: true });
    expect(await expireMarketplaceState(now)).toMatchObject({ outboxPayloadsMinimized: 1, hasMore: false });
    expect(await expireMarketplaceState(now)).toMatchObject({ outboxPayloadsMinimized: 0, hasMore: false });
    expect((await database.query('SELECT subject FROM "EmailOutbox" WHERE id = $1', ["pending"])).rows)
      .toEqual([{ subject: "Pending" }]);
    expect((await database.query('SELECT "updatedAt" FROM "EmailOutbox" WHERE id = $1', ["already-cleared"])).rows)
      .toEqual([{ updatedAt: null }]);
  });

  it.each([true, false])("bounds LOI transitions and never emits duplicate events (expired: %s)", async (expired) => {
    await database.exec(`
      INSERT INTO "User" VALUES ('buyer-user', 'ACTIVE', ARRAY['BUYER']), ('seller-user', 'ACTIVE', ARRAY['SELLER']);
      INSERT INTO "SellerAccess" VALUES ('seller-user', '${expired ? "APPROVED" : "SUSPENDED"}');
      INSERT INTO "SellerProperty" VALUES ('property', 1, 'READY_FOR_INVITES', 'APPROVED', NULL, 'seller-user', 1);
      INSERT INTO "Conversation" VALUES ('conversation', 'ACTIVE');
      INSERT INTO "Invite" (id, "buyerProfileId", "sellerId", "propertyId", title, status, "expiresAt", "propertyIdentityVersion")
      VALUES ('accepted', 'buyer-profile', 'seller-user', 'property', 'Private invitation', 'ACCEPTED', '2026-09-01', 1);
      INSERT INTO "LoiRevision"
      SELECT 'revision-' || value, '${expired ? "2026-09-01" : "2026-10-01"}'::timestamptz
      FROM generate_series(1, ${MAINTENANCE_BATCH_SIZE + 1}) value;
      INSERT INTO "LoiNegotiation"
      SELECT 'loi-' || value, 'buyer-user', 'seller-user', 'revision-' || value, 'accepted', 'conversation', 'property', 1,
        'AWAITING_SELLER_RESPONSE'::"LoiNegotiationStatus"
      FROM generate_series(1, ${MAINTENANCE_BATCH_SIZE + 1}) value;
    `);
    const counter = expired ? "loiNegotiationsExpired" : "loiNegotiationsFrozen";
    expect(await expireMarketplaceState(now)).toMatchObject({ [counter]: MAINTENANCE_BATCH_SIZE, hasMore: true });
    expect(await expireMarketplaceState(now)).toMatchObject({ [counter]: 1, hasMore: false });
    expect(await expireMarketplaceState(now)).toMatchObject({ [counter]: 0, hasMore: false });
    expect(mocks.tx.loiEvent.create).toHaveBeenCalledTimes(MAINTENANCE_BATCH_SIZE + 1);
    const events = mocks.tx.loiEvent.create.mock.calls.map(([arg]) => arg.data);
    expect(new Set(events.map((event) => event.negotiationId)).size).toBe(MAINTENANCE_BATCH_SIZE + 1);
    expect(events.every((event) => event.type === (expired ? "EXPIRED" : "FROZEN"))).toBe(true);
  });
});
