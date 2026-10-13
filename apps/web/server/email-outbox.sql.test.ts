import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    emailOutbox: { updateMany: vi.fn() },
    workerHeartbeat: { upsert: vi.fn() },
  },
  sendInvite: vi.fn(),
  sendLoi: vi.fn(),
  sendUnread: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
vi.mock("./email", () => ({
  sendInviteEmail: mocks.sendInvite,
  sendLoiUpdateEmail: mocks.sendLoi,
  sendUnreadMessageEmail: mocks.sendUnread,
}));

import { claimEmailJobs, processEmailOutbox } from "./email-outbox";

const buyerId = "019f62c5-1c07-4a62-9f9a-8302778aa012";
const sellerId = "019f62c5-1c07-4a62-9f9a-8302778aa013";
const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const revisionId = "019f62c5-1c07-4a62-9f9a-8302778aa014";
const eventId = "019f62c5-1c07-4a62-9f9a-8302778aa015";
const messageId = "019f62c5-1c07-4a62-9f9a-8302778aa016";
let database: PGlite;

describe("email delivery eligibility in isolated PostgreSQL", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');
      CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
      CREATE TYPE "SellerAccessStatus" AS ENUM ('APPROVED', 'SUSPENDED');
      CREATE TYPE "PropertyStatus" AS ENUM ('READY_FOR_INVITES', 'DRAFT');
      CREATE TYPE "PropertyVerificationStatus" AS ENUM ('APPROVED', 'PENDING');
      CREATE TYPE "BuyerVisibilityStatus" AS ENUM ('ACTIVE', 'DRAFT');
      CREATE TYPE "InviteStatus" AS ENUM ('SENT', 'VIEWED', 'ACCEPTED');
      CREATE TYPE "ConversationStatus" AS ENUM ('AWAITING_BUYER', 'ACTIVE');
      CREATE TYPE "MessageKind" AS ENUM ('GUIDED', 'FREE_TEXT');
      CREATE TABLE "User" (id uuid PRIMARY KEY, email text, status "UserStatus", roles "UserRole"[]);
      CREATE TABLE "BuyerProfile" (id text PRIMARY KEY, "userId" uuid, "visibilityStatus" "BuyerVisibilityStatus");
      CREATE TABLE "SellerAccess" ("userId" uuid PRIMARY KEY, status "SellerAccessStatus");
      CREATE TABLE "SellerProperty" (
        id text PRIMARY KEY, "ownerUserId" uuid, status "PropertyStatus",
        "ownershipVerificationStatus" "PropertyVerificationStatus", "flaggedForReviewAt" timestamptz,
        "authorityAttestedIdentityVersion" integer, "identityVersion" integer
      );
      CREATE TABLE "Invite" (
        id text PRIMARY KEY, "sellerId" uuid, "buyerProfileId" text, "propertyId" text,
        status "InviteStatus", "propertyIdentityVersion" integer, "expiresAt" timestamptz
      );
      CREATE TABLE "Conversation" (id uuid PRIMARY KEY, "inviteId" text, status "ConversationStatus");
      CREATE TABLE "ConversationParticipant" (
        "conversationId" uuid, "userId" uuid, "mutedAt" timestamptz,
        "lastReadAt" timestamptz, "lastReadMessageId" uuid
      );
      CREATE TABLE "UserBlock" ("blockerUserId" uuid, "blockedUserId" uuid);
      CREATE TABLE "Message" (
        id uuid PRIMARY KEY, "conversationId" uuid, "senderUserId" uuid, kind "MessageKind", "createdAt" timestamptz
      );
      CREATE TABLE "LoiNegotiation" (
        id uuid PRIMARY KEY, "buyerUserId" uuid, "sellerUserId" uuid, "currentRevisionId" uuid,
        "inviteId" text, "conversationId" uuid, "propertyId" text, "propertyIdentityVersion" integer, status text
      );
      CREATE TABLE "LoiRevision" (
        id uuid PRIMARY KEY, "negotiationId" uuid, "submittedByUserId" uuid, "responseDeadline" timestamptz
      );
      CREATE TABLE "LoiEvent" (
        id uuid PRIMARY KEY, "negotiationId" uuid, "revisionId" uuid, type text, "actorUserId" uuid
      );
      CREATE TABLE "EmailOutbox" (
        id text PRIMARY KEY, type text, attempts integer NOT NULL DEFAULT 0, "idempotencyKey" text,
        "inviteId" text, "messageConversationId" uuid, "messageRecipientUserId" uuid,
        "loiNegotiationId" uuid, "loiRevisionId" uuid, "loiRecipientUserId" uuid,
        "tourScheduleId" uuid, "tourRevision" integer, "tourRecipientUserId" uuid, "tourEvent" text,
        status text NOT NULL DEFAULT 'PENDING', "nextAttemptAt" timestamptz,
        "leaseUntil" timestamptz, "lockedAt" timestamptz, "workerId" text,
        "lastError" text, "sentAt" timestamptz, "providerMessageId" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO "User" VALUES
        ('${buyerId}', 'buyer@example.test', 'ACTIVE', ARRAY['BUYER']::"UserRole"[]),
        ('${sellerId}', 'seller@example.test', 'ACTIVE', ARRAY['SELLER']::"UserRole"[]);
      INSERT INTO "BuyerProfile" VALUES ('buyer-profile', '${buyerId}', 'ACTIVE');
      INSERT INTO "SellerAccess" VALUES ('${sellerId}', 'APPROVED');
      INSERT INTO "SellerProperty" VALUES ('property', '${sellerId}', 'READY_FOR_INVITES', 'APPROVED', NULL, 1, 1);
      INSERT INTO "Invite" VALUES ('invite', '${sellerId}', 'buyer-profile', 'property', 'ACCEPTED', 1, now() + interval '1 day');
      INSERT INTO "Conversation" VALUES ('${conversationId}', 'invite', 'ACTIVE');
      INSERT INTO "ConversationParticipant" VALUES
        ('${conversationId}', '${buyerId}', NULL, NULL, NULL),
        ('${conversationId}', '${sellerId}', NULL, NULL, NULL);
      INSERT INTO "Message" VALUES ('${messageId}', '${conversationId}', '${sellerId}', 'FREE_TEXT', now());
      INSERT INTO "LoiNegotiation" VALUES (
        '${conversationId}', '${buyerId}', '${sellerId}', '${revisionId}', 'invite', '${conversationId}', 'property', 1, 'AWAITING_SELLER_RESPONSE'
      );
      INSERT INTO "LoiRevision" VALUES ('${revisionId}', '${conversationId}', '${buyerId}', now() + interval '1 day');
      INSERT INTO "LoiEvent" VALUES ('${eventId}', '${conversationId}', '${revisionId}', 'INITIAL_SUBMITTED', '${buyerId}');
    `);
  }, 30_000);

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${buyerId},${sellerId}`);
    vi.stubEnv("LIBER_LOI_V1_ENABLED", "true");
    vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", `${buyerId},${sellerId}`);
    mocks.prisma.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.workerHeartbeat.upsert.mockResolvedValue({});
    mocks.sendUnread.mockResolvedValue({ id: "unread-email", provider: "resend", queued: true });
    mocks.sendLoi.mockResolvedValue({ id: "loi-email", provider: "resend", queued: true });
    await database.exec("BEGIN");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await database.exec("ROLLBACK");
  });

  afterAll(async () => database?.close());

  it.each([buyerId, sellerId])("delivers unread email to either eligible participant (%s)", async (recipientId) => {
    const senderId = recipientId === buyerId ? sellerId : buyerId;
    await database.query('UPDATE "Message" SET "senderUserId" = $1', [senderId]);
    useJob(unreadJob(recipientId));

    await expect(processEmailOutbox(1, "sql-worker")).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.sendUnread).toHaveBeenCalledWith({
      conversationId,
      to: recipientId === buyerId ? "buyer@example.test" : "seller@example.test",
    }, "message-unread/test");
  });

  it.each([buyerId, sellerId])("cancels unread delivery after a participant loses their role (%s)", async (userId) => {
    await database.query('UPDATE "User" SET roles = ARRAY[]::"UserRole"[] WHERE id = $1', [userId]);
    useJob(unreadJob(buyerId));

    await expect(processEmailOutbox(1, "sql-worker")).resolves.toMatchObject({ cancelled: 1, failed: 0, sent: 0 });
    expect(mocks.sendUnread).not.toHaveBeenCalled();
  });

  it("delivers the current LOI submission before its response deadline", async () => {
    useJob(loiJob(sellerId));
    await expect(processEmailOutbox(1, "sql-worker")).resolves.toMatchObject({ sent: 1, failed: 0 });
  });

  it("cancels an overdue LOI submission before expiry maintenance updates its stored status", async () => {
    await database.exec('UPDATE "LoiRevision" SET "responseDeadline" = now()');
    useJob(loiJob(sellerId));

    await expect(processEmailOutbox(1, "sql-worker")).resolves.toMatchObject({ cancelled: 1, failed: 0, sent: 0 });
    expect(mocks.sendLoi).not.toHaveBeenCalled();
  });

  it("still delivers a committed terminal LOI event after the old response deadline", async () => {
    await database.exec(`
      UPDATE "LoiRevision" SET "responseDeadline" = now() - interval '1 minute';
      UPDATE "LoiNegotiation" SET status = 'TERMS_ALIGNED';
      UPDATE "LoiEvent" SET type = 'TERMS_ALIGNED', "actorUserId" = '${sellerId}';
    `);
    useJob(loiJob(buyerId));

    await expect(processEmailOutbox(1, "sql-worker")).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.sendLoi).toHaveBeenCalledWith({
      negotiationId: conversationId,
      to: "buyer@example.test",
    }, `loi-update:${eventId}:${buyerId}`);
  });

  it("lets another worker process a waiting job while the first provider request is slow", async () => {
    useDatabaseQueue();
    await seedUnreadJobs("slow-job", "waiting-job");
    let finishFirst!: () => void;
    let providerStarted!: () => void;
    const providerReady = new Promise<void>((resolve) => { providerStarted = resolve; });
    const providerRelease = new Promise<void>((resolve) => { finishFirst = resolve; });
    mocks.sendUnread.mockImplementationOnce(async () => {
      providerStarted();
      await providerRelease;
      return { id: "slow-email", provider: "resend", queued: true };
    });

    const firstWorker = processEmailOutbox(2, "slow-worker");
    await providerReady;
    try {
      await expect(processEmailOutbox(1, "second-worker")).resolves.toMatchObject({ processed: 1, sent: 1 });
    } finally {
      finishFirst();
      await firstWorker;
    }
    expect(mocks.sendUnread).toHaveBeenCalledTimes(2);
    const { rows } = await database.query<{ status: string; attempts: number }>('SELECT status, attempts FROM "EmailOutbox"');
    expect(rows).toEqual([{ status: "SENT", attempts: 1 }, { status: "SENT", attempts: 1 }]);
  });

  it("does not submit to the provider when its lease expired during eligibility checks", async () => {
    useDatabaseQueue();
    await seedUnreadJobs("expired-before-send");
    mocks.prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const rows = await executeQuery(strings, ...values);
      if (strings.join("").includes("recipient_user.email")) {
        await database.exec('UPDATE "EmailOutbox" SET "leaseUntil" = now() - interval \'1 second\'');
      }
      return rows;
    });

    await expect(processEmailOutbox(1, "old-worker")).resolves.toMatchObject({ processed: 1, sent: 0, failed: 0 });
    expect(mocks.sendUnread).not.toHaveBeenCalled();
    await expect(claimEmailJobs(1, "new-worker")).resolves.toMatchObject([{ attempts: 2, id: "expired-before-send" }]);
  });

  it.each(["success", "failure"])("does not finalize a reclaimed job after a delayed provider %s", async (outcome) => {
    useDatabaseQueue();
    await seedUnreadJobs("reclaimed-job");
    mocks.sendUnread.mockImplementationOnce(async () => {
      await database.exec('UPDATE "EmailOutbox" SET "leaseUntil" = now() - interval \'1 second\'');
      // Reusing the worker name proves the attempt number also fences the lease generation.
      await claimEmailJobs(1, "same-worker");
      if (outcome === "failure") throw new Error("Provider timed out.");
      return { id: "stale-provider-response", provider: "resend", queued: true };
    });

    await expect(processEmailOutbox(1, "same-worker")).resolves.toMatchObject({ processed: 1, sent: 0, failed: 0 });
    const { rows } = await database.query('SELECT status, attempts, "workerId", "providerMessageId", "lastError" FROM "EmailOutbox"');
    expect(rows).toEqual([{
      status: "SENDING", attempts: 2, workerId: "same-worker", providerMessageId: null, lastError: null,
    }]);
  });

  it("terminalizes an expired final attempt without touching a still-active final attempt", async () => {
    useDatabaseQueue();
    await seedUnreadJobs("exhausted-job", "active-final-job", "pending-job");
    await database.exec(`
      UPDATE "EmailOutbox" SET status = 'SENDING', attempts = 5,
        "workerId" = 'old-worker', "lockedAt" = now(), "leaseUntil" = now() - interval '1 second'
      WHERE id = 'exhausted-job';
      UPDATE "EmailOutbox" SET status = 'SENDING', attempts = 5,
        "workerId" = 'active-worker', "lockedAt" = now(), "leaseUntil" = now() + interval '1 minute'
      WHERE id = 'active-final-job';
    `);

    await expect(claimEmailJobs(1, "new-worker")).resolves.toMatchObject([{ id: "pending-job", attempts: 1 }]);
    const { rows } = await database.query('SELECT id, status, attempts, "workerId", "leaseUntil", "nextAttemptAt", "lastError" FROM "EmailOutbox" ORDER BY id');
    expect(rows[0]).toMatchObject({ id: "active-final-job", status: "SENDING", attempts: 5, workerId: "active-worker" });
    expect(rows[1]).toMatchObject({
      id: "exhausted-job", status: "FAILED", attempts: 5, workerId: null,
      leaseUntil: null, nextAttemptAt: null, lastError: "Email delivery lease expired after the final attempt.",
    });
  });
});

function useJob(job: ReturnType<typeof unreadJob> | ReturnType<typeof loiJob>) {
  mocks.prisma.$queryRaw
    .mockResolvedValueOnce([job])
    .mockImplementationOnce(executeQuery);
}

async function executeQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.reduce((query, segment, index) => query + (index ? `$${index}` : "") + segment, "");
  return (await database.query(sql, values)).rows;
}

function useDatabaseQueue() {
  mocks.prisma.$queryRaw.mockImplementation(executeQuery);
  mocks.prisma.emailOutbox.updateMany.mockImplementation(async ({ where, data }: {
    where: Record<string, string | number | { gt: Date }>;
    data: Record<string, string | number | Date | null>;
  }) => {
    const values: unknown[] = [];
    const set = Object.entries(data).map(([column, value]) => {
      values.push(value);
      return `"${column}" = $${values.length}`;
    });
    const predicates = Object.entries(where).map(([column, value]) => {
      const comparison = typeof value === "object" ? ">" : "=";
      values.push(typeof value === "object" ? value.gt : value);
      return `"${column}" ${comparison} $${values.length}`;
    });
    const result = await database.query(`UPDATE "EmailOutbox" SET ${set.join(", ")} WHERE ${predicates.join(" AND ")} RETURNING id`, values);
    return { count: result.rows.length };
  });
}

async function seedUnreadJobs(...ids: string[]) {
  for (const id of ids) {
    await database.query(`INSERT INTO "EmailOutbox" (id, type, "idempotencyKey", "messageConversationId", "messageRecipientUserId")
      VALUES ($1, 'MESSAGE_UNREAD', $2, $3, $4)`, [id, `message-unread:${id}`, conversationId, buyerId]);
  }
}

function unreadJob(recipientId: string) {
  return {
    id: "sql-unread-job", type: "MESSAGE_UNREAD", attempts: 1,
    idempotencyKey: "message-unread/test", inviteId: null,
    messageConversationId: conversationId, messageRecipientUserId: recipientId,
    loiNegotiationId: null, loiRevisionId: null, loiRecipientUserId: null,
  };
}

function loiJob(recipientId: string) {
  return {
    id: "sql-loi-job", type: "LOI_UPDATE", attempts: 1,
    idempotencyKey: `loi-update:${eventId}:${recipientId}`, inviteId: null,
    messageConversationId: null, messageRecipientUserId: null,
    loiNegotiationId: conversationId, loiRevisionId: revisionId, loiRecipientUserId: recipientId,
  };
}
