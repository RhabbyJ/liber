import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real messaging service SQL against an in-process PostgreSQL. Only the session,
// the rate limiter and Prisma's model-API writes are stand-ins: every raw query,
// lock and eligibility predicate the service composes runs unchanged. PGlite has
// no PostGIS or pgcrypto, so the schema below keeps just the tables, columns and
// enums these paths touch and maps pgcrypto's sha256 digest onto the core sha256().

type SqlStatement = { text: string; values: unknown[] };
type SqlTag = (strings: readonly string[], ...values: unknown[]) => SqlStatement;

const harness = vi.hoisted(() => {
  const state = {
    database: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>; exec: (sql: string) => Promise<unknown> },
    sql: null as null | ((strings: readonly string[], ...values: unknown[]) => { text: string; values: unknown[] }),
    user: null as null | { id: string; roles: string[] },
    savepoint: 0,
  };
  const database = () => {
    if (!state.database) throw new Error("PGlite is not ready.");
    return state.database;
  };
  const statement = (first: unknown, values: unknown[]) => Array.isArray(first)
    ? state.sql!(first as readonly string[], ...values)
    : first as { text: string; values: unknown[] };
  const insert = async (table: string, data: Record<string, unknown>) => {
    const columns = Object.keys(data);
    const values = columns.map((column) => {
      const value = data[column];
      return value && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value;
    });
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const result = await database().query(
      `INSERT INTO public."${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`,
      values,
    );
    return result.rows[0] as { id: string };
  };
  const client = {
    async $queryRaw(first: unknown, ...values: unknown[]) {
      const sql = statement(first, values);
      return (await database().query(sql.text, sql.values)).rows;
    },
    async $executeRaw(first: unknown, ...values: unknown[]) {
      const sql = statement(first, values);
      return (await database().query(sql.text, sql.values)).affectedRows ?? 0;
    },
    // Interactive transactions become savepoints inside each test's rollback-only transaction.
    async $transaction(operation: (tx: unknown) => Promise<unknown>) {
      const name = `messaging_tx_${state.savepoint += 1}`;
      await database().exec(`SAVEPOINT ${name}`);
      try {
        const result = await operation(client);
        await database().exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await database().exec(`ROLLBACK TO SAVEPOINT ${name}`);
        await database().exec(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => insert("AdminAuditLog", { id: crypto.randomUUID(), ...data }),
    },
    emailOutbox: {
      create: async ({ data }: { data: Record<string, unknown> }) => insert("EmailOutbox", { id: crypto.randomUUID(), ...data }),
      // Only the block path calls this, to cancel LOI emails; the fixture has no LOI rows.
      updateMany: async () => ({ count: 0 }),
    },
  };
  return { client, state };
});

vi.mock("@liber/db", async () => {
  // The generated client's own Prisma.sql/join/empty, exactly as @liber/db re-exports
  // them, loaded without constructing a PrismaClient or touching DATABASE_URL.
  const { createRequire } = await import("node:module");
  const { Prisma } = createRequire(import.meta.url)("@liber/db/src/generated/client") as { Prisma: { sql: SqlTag } };
  harness.state.sql = Prisma.sql;
  return { Prisma, prisma: harness.client };
});
vi.mock("../session", () => ({ getSessionUser: vi.fn(async () => harness.state.user) }));
vi.mock("../rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) }));

import {
  blockConversationUser,
  getConversationThread,
  listConversationMessages,
  listConversations,
  markConversationRead,
  reportMessage,
  sendConversationMessage,
  setConversationMuted,
} from "./service";
import { countUnreadConversations, UNREAD_CONVERSATION_COUNT_CAP } from "./unread";

const sellerId = "019f62c5-1c07-4a62-9f9a-8302778ab001";
const buyerId = "019f62c5-1c07-4a62-9f9a-8302778ab002";
const outsiderId = "019f62c5-1c07-4a62-9f9a-8302778ab003";
const conversationId = "019f62c5-1c07-4a62-9f9a-8302778ab010";
const inviteMessageId = "019f62c5-1c07-4a62-9f9a-8302778ab020";
const inviteId = "invite-eligibility";
const seller = { id: sellerId, roles: ["SELLER"] };
const buyer = { id: buyerId, roles: ["BUYER"] };
const outsider = { id: outsiderId, roles: ["BUYER", "SELLER"] };
// In-process PostgreSQL is CPU-bound; leave headroom when other suites run in parallel.
const SQL_TEST_TIMEOUT_MS = 20_000;
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  harness.state.database = database;
  await database.exec(SCHEMA);
}, 60_000);

beforeEach(async () => {
  vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
  vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${sellerId},${buyerId},${outsiderId}`);
  harness.state.user = null;
  // Every test starts from the same fixture and rolls back everything it wrote.
  await database.exec("BEGIN");
  await database.exec(FIXTURE);
}, SQL_TEST_TIMEOUT_MS);

afterEach(async () => {
  vi.unstubAllEnvs();
  await database.exec("ROLLBACK");
}, SQL_TEST_TIMEOUT_MS);

afterAll(async () => database?.close());

describe("messaging eligibility SQL in isolated PostgreSQL", { timeout: SQL_TEST_TIMEOUT_MS }, () => {
  it("lets both participants read and the buyer reply while the invitation is open", async () => {
    signInAs(buyer);
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({
      canSend: true,
      closedReason: null,
      imageIds: ["image-current"],
      items: [{ id: inviteMessageId, kind: "INVITE", sender: "COUNTERPARTY" }],
      participantRole: "BUYER",
      status: "AWAITING_BUYER",
    });
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab101", "Is the garage detached?")))
      .resolves.toMatchObject({ data: { body: "Is the garage detached?", sender: "YOU" }, idempotent: false });
    expect(await messageBodies()).toEqual(["Seller invite", "Is the garage detached?"]);
    expect(await rows('SELECT type, "messageRecipientUserId" AS recipient FROM public."EmailOutbox"'))
      .toEqual([{ recipient: sellerId, type: "MESSAGE_UNREAD" }]);

    signInAs(seller);
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({
      canSend: false,
      items: [{ sender: "YOU" }, { body: "Is the garage detached?", sender: "COUNTERPARTY" }],
      participantRole: "SELLER",
    });
  });

  it("denies a non-participant every read and write with the same not-found result", async () => {
    signInAs(outsider);
    const notFound = { code: "NOT_FOUND", status: 404 };
    await expect(getConversationThread(conversationId)).rejects.toMatchObject(notFound);
    await expect(listConversationMessages({ conversationId })).rejects.toMatchObject(notFound);
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab102", "Hello"))).rejects.toMatchObject(notFound);
    await expect(markConversationRead({ conversationId, lastReadMessageId: inviteMessageId })).rejects.toMatchObject(notFound);
    await expect(setConversationMuted({ conversationId, muted: true })).rejects.toMatchObject(notFound);
    await expect(blockConversationUser({ conversationId })).rejects.toMatchObject(notFound);
    await expect(reportMessage({ category: "SPAM", messageId: inviteMessageId })).rejects.toMatchObject(notFound);
    await expect(listConversations()).resolves.toMatchObject({ items: [] });
    await expect(countUnreadConversations(outsiderId)).resolves.toBe(0);

    expect(await messageBodies()).toEqual(["Seller invite"]);
    expect(await rows('SELECT 1 FROM public."UserBlock"')).toEqual([]);
    expect(await rows('SELECT 1 FROM public."AdminAuditLog"')).toEqual([]);
    expect(await rows('SELECT "lastReadMessageId", "mutedAt" FROM public."ConversationParticipant" WHERE "lastReadMessageId" IS NOT NULL OR "mutedAt" IS NOT NULL')).toEqual([]);
  });

  it("stops sending in both directions once either participant blocks the other", async () => {
    await acceptInvite();
    signInAs(seller);
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab103", "Tuesday works for a viewing.")))
      .resolves.toMatchObject({ idempotent: false });

    signInAs(buyer);
    await expect(blockConversationUser({ conversationId })).resolves.toEqual({ data: { blocked: true } });
    expect(await rows('SELECT "blockerUserId" AS blocker, "blockedUserId" AS blocked FROM public."UserBlock"'))
      .toEqual([{ blocked: sellerId, blocker: buyerId }]);

    const unavailable = { code: "UNAVAILABLE", status: 409 };
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab104", "Are you there?")))
      .rejects.toMatchObject(unavailable);
    signInAs(seller);
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab105", "Following up.")))
      .rejects.toMatchObject(unavailable);
    // History stays readable, but the thread is closed without revealing who blocked.
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({
      canSend: false,
      closedReason: "CONVERSATION_UNAVAILABLE",
      imageIds: [],
      invite: { status: "Unavailable" },
      status: "READ_ONLY",
    });
    expect(await messageBodies()).toEqual(["Seller invite", "Tuesday works for a viewing."]);
  });

  it("treats a block recorded in either direction as closing the pair", async () => {
    await acceptInvite();
    await database.query('INSERT INTO public."UserBlock" ("blockerUserId", "blockedUserId", "createdAt") VALUES ($1, $2, now())', [sellerId, buyerId]);
    signInAs(buyer);
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab106", "Hello?")))
      .rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({ canSend: false, status: "READ_ONLY" });
  });

  it.each([
    ["a declined", 'UPDATE public."Invite" SET status = \'DECLINED\'', "INVITE_DECLINED", "Declined"],
    ["a stored-expired", 'UPDATE public."Invite" SET status = \'EXPIRED\'', "INVITE_EXPIRED", "Expired"],
    ["an effectively expired", 'UPDATE public."Invite" SET "expiresAt" = now() - interval \'1 minute\'', "INVITE_EXPIRED", "Expired"],
    ["a withdrawn", 'UPDATE public."Invite" SET status = \'WITHDRAWN\'', "INVITE_WITHDRAWN", "Withdrawn"],
  ])("keeps %s invitation's history readable but read-only", async (_label, closeInvite, closedReason, inviteStatus) => {
    await database.exec(closeInvite);
    for (const participant of [buyer, seller]) {
      signInAs(participant);
      await expect(getConversationThread(conversationId)).resolves.toMatchObject({
        canSend: false,
        closedReason,
        invite: { status: inviteStatus },
        items: [{ id: inviteMessageId }],
        status: "READ_ONLY",
      });
    }
    signInAs(buyer);
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab107", "Still available?")))
      .rejects.toMatchObject({ code: "UNAVAILABLE", status: 409 });
    expect(await messageBodies()).toEqual(["Seller invite"]);
  });

  it("keeps an accepted conversation open after the original response deadline", async () => {
    await acceptInvite();
    await database.exec('UPDATE public."Invite" SET "expiresAt" = now() - interval \'30 days\'');
    signInAs(seller);
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({ canSend: true, status: "ACTIVE" });
    await expect(sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab108", "Here are the disclosures.")))
      .resolves.toMatchObject({ idempotent: false });
  });
});

describe("unread conversation count in isolated PostgreSQL", { timeout: SQL_TEST_TIMEOUT_MS }, () => {
  it("matches the inbox's unread rule and clears when the participant reads", async () => {
    await expect(countUnreadConversations(buyerId)).resolves.toBe(1);
    await expect(countUnreadConversations(sellerId)).resolves.toBe(0);
    signInAs(buyer);
    const inbox = await listConversations();
    expect(inbox.items.filter((item) => item.unreadCount > 0)).toHaveLength(1);

    await markConversationRead({ conversationId, lastReadMessageId: inviteMessageId });
    await expect(countUnreadConversations(buyerId)).resolves.toBe(0);

    await sendConversationMessage(freeText("019f62c5-1c07-4a62-9f9a-8302778ab109", "Could I see it Saturday?"));
    await expect(countUnreadConversations(sellerId)).resolves.toBe(1);
    await expect(countUnreadConversations(buyerId)).resolves.toBe(0);
  });

  it("counts Liber system updates for both participants", async () => {
    await database.query(`UPDATE public."ConversationParticipant" SET "lastReadMessageId" = $1, "lastReadAt" = now() - interval '1 hour'`, [inviteMessageId]);
    await database.query(`INSERT INTO public."Message" (id, "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt")
      VALUES (gen_random_uuid(), $1, NULL, 'SYSTEM', 'A property tour time was proposed.', gen_random_uuid(), 'ALLOWED', now())`, [conversationId]);
    await expect(countUnreadConversations(buyerId)).resolves.toBe(1);
    await expect(countUnreadConversations(sellerId)).resolves.toBe(1);
  });

  it("returns null when messaging is off and skips counterparties outside an explicit cohort", async () => {
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "false");
    await expect(countUnreadConversations(buyerId)).resolves.toBeNull();
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${buyerId},${outsiderId}`);
    await expect(countUnreadConversations(buyerId)).resolves.toBe(0);
    signInAs(buyer);
    await expect(listConversations()).resolves.toMatchObject({ items: [] });
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", buyerId);
    await expect(countUnreadConversations(buyerId)).resolves.toBe(0);
  });

  it("stops counting at the badge cap", async () => {
    await database.query(`
      WITH extra AS (
        SELECT gen_random_uuid() AS id, series FROM generate_series(1, $1::integer) AS series
      ), conversations AS (
        INSERT INTO public."Conversation" (id, "inviteId", status, "propertySnapshot", "lastMessageAt")
        SELECT id, 'bulk-invite-' || series, 'ACTIVE', '{}'::jsonb, now() FROM extra
        RETURNING id
      ), members AS (
        INSERT INTO public."ConversationParticipant" ("conversationId", "userId", role, "createdAt")
        SELECT id, $2::uuid, 'BUYER'::"ConversationParticipantRole", now() FROM conversations
        UNION ALL
        SELECT id, $3::uuid, 'SELLER'::"ConversationParticipantRole", now() FROM conversations
        RETURNING "conversationId"
      )
      INSERT INTO public."Message" (id, "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt")
      SELECT gen_random_uuid(), id, $3::uuid, 'FREE_TEXT', 'Bulk', gen_random_uuid(), 'ALLOWED', now() FROM conversations
    `, [UNREAD_CONVERSATION_COUNT_CAP + 5, buyerId, sellerId]);
    await expect(countUnreadConversations(buyerId)).resolves.toBe(UNREAD_CONVERSATION_COUNT_CAP);
  });
});

function signInAs(user: { id: string; roles: string[] }) {
  harness.state.user = user;
}

function freeText(clientMessageId: string, body: string) {
  return { body, clientMessageId, conversationId, kind: "FREE_TEXT" as const };
}

async function acceptInvite() {
  await database.exec(`
    UPDATE public."Invite" SET status = 'ACCEPTED';
    UPDATE public."Conversation" SET status = 'ACTIVE';
  `);
}

async function rows(sql: string) {
  return (await database.query(sql)).rows;
}

async function messageBodies() {
  return (await database.query<{ body: string }>('SELECT body FROM public."Message" ORDER BY "createdAt", id')).rows
    .map((row) => row.body);
}

const SCHEMA = `
  CREATE SCHEMA extensions;
  -- pgcrypto's digest(bytea, 'sha256') equals the core sha256(); only sha256 is used.
  CREATE FUNCTION extensions.digest(data bytea, algorithm text) RETURNS bytea
    LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT sha256(data) $$;

  CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
  CREATE TYPE "SellerAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
  CREATE TYPE "BuyerVisibilityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'HIDDEN', 'SUSPENDED');
  CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'READY_FOR_INVITES', 'ARCHIVED');
  CREATE TYPE "PropertyVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');
  CREATE TYPE "InviteStatus" AS ENUM ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');
  CREATE TYPE "ConversationStatus" AS ENUM ('AWAITING_BUYER', 'ACTIVE', 'READ_ONLY', 'BLOCKED');
  CREATE TYPE "ConversationClosedReason" AS ENUM (
    'INVITE_DECLINED', 'INVITE_EXPIRED', 'INVITE_WITHDRAWN', 'PROPERTY_IDENTITY_CHANGED', 'PROPERTY_INELIGIBLE',
    'SELLER_INELIGIBLE', 'BUYER_INELIGIBLE', 'USER_SUSPENDED', 'USER_BLOCKED'
  );
  CREATE TYPE "ConversationParticipantRole" AS ENUM ('SELLER', 'BUYER');
  CREATE TYPE "MessageKind" AS ENUM ('INVITE', 'GUIDED', 'FREE_TEXT', 'SYSTEM');
  CREATE TYPE "MessageModerationStatus" AS ENUM ('ALLOWED', 'FLAGGED', 'REDACTED');
  CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
  CREATE TYPE "LoiNegotiationStatus" AS ENUM (
    'AWAITING_BUYER_SUBMISSION', 'AWAITING_SELLER_RESPONSE', 'AWAITING_BUYER_RESPONSE', 'TERMS_ALIGNED',
    'DECLINED', 'WITHDRAWN', 'EXPIRED', 'READ_ONLY'
  );
  CREATE TYPE "LoiClosedReason" AS ENUM ('PARTICIPANTS_BLOCKED');
  CREATE TYPE "LoiEventType" AS ENUM ('FROZEN');

  CREATE TABLE "User" (
    id uuid PRIMARY KEY, email text NOT NULL, name text, "avatarVariant" text NOT NULL,
    roles "UserRole"[] NOT NULL, status "UserStatus" NOT NULL
  );
  CREATE TABLE "SellerAccess" ("userId" uuid PRIMARY KEY REFERENCES "User"(id), status "SellerAccessStatus" NOT NULL);
  CREATE TABLE "BuyerProfile" (
    id text PRIMARY KEY, "userId" uuid NOT NULL UNIQUE REFERENCES "User"(id), "displayName" text NOT NULL,
    "visibilityStatus" "BuyerVisibilityStatus" NOT NULL
  );
  CREATE TABLE "SellerProperty" (
    id text PRIMARY KEY, "ownerUserId" uuid NOT NULL REFERENCES "User"(id), status "PropertyStatus" NOT NULL,
    "ownershipVerificationStatus" "PropertyVerificationStatus" NOT NULL, "identityVersion" integer NOT NULL,
    "authorityAttestedIdentityVersion" integer, "flaggedForReviewAt" timestamptz
  );
  CREATE TABLE "PropertyImage" (
    id text PRIMARY KEY, "propertyId" text NOT NULL REFERENCES "SellerProperty"(id),
    "propertyIdentityVersion" integer NOT NULL, "sortOrder" integer NOT NULL DEFAULT 0
  );
  CREATE TABLE "Invite" (
    id text PRIMARY KEY, "sellerId" uuid NOT NULL REFERENCES "User"(id), "buyerProfileId" text NOT NULL REFERENCES "BuyerProfile"(id),
    "propertyId" text NOT NULL REFERENCES "SellerProperty"(id), "propertyIdentityVersion" integer NOT NULL,
    status "InviteStatus" NOT NULL, "expiresAt" timestamptz NOT NULL, "viewedAt" timestamptz,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "Conversation" (
    id uuid PRIMARY KEY, "inviteId" text NOT NULL UNIQUE, status "ConversationStatus" NOT NULL,
    "closedReason" "ConversationClosedReason", "propertySnapshot" jsonb NOT NULL,
    "lastMessageAt" timestamptz NOT NULL, "moderationUpdatedAt" timestamptz
  );
  CREATE TABLE "ConversationParticipant" (
    "conversationId" uuid NOT NULL REFERENCES "Conversation"(id), "userId" uuid NOT NULL,
    role "ConversationParticipantRole" NOT NULL, "lastReadMessageId" uuid, "lastReadAt" timestamptz,
    "mutedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("conversationId", "userId"), UNIQUE ("conversationId", role)
  );
  CREATE INDEX ON "ConversationParticipant" ("userId", "conversationId");
  CREATE TABLE "Message" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "conversationId" uuid NOT NULL REFERENCES "Conversation"(id),
    "senderUserId" uuid, kind "MessageKind" NOT NULL, "templateKey" text, "templateVersion" integer,
    body text NOT NULL, "clientMessageId" uuid NOT NULL,
    "moderationStatus" "MessageModerationStatus" NOT NULL DEFAULT 'ALLOWED',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("conversationId", "clientMessageId")
  );
  CREATE INDEX ON "Message" ("conversationId", "createdAt" DESC, id DESC);
  CREATE TABLE "UserBlock" (
    "blockerUserId" uuid NOT NULL, "blockedUserId" uuid NOT NULL, reason text,
    "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("blockerUserId", "blockedUserId")
  );
  CREATE TABLE "AdminAuditLog" (
    id text PRIMARY KEY, "actorUserId" uuid, action text NOT NULL, "targetType" text NOT NULL,
    "targetId" text NOT NULL, metadata jsonb, "createdAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "EmailOutbox" (
    id text PRIMARY KEY, type text NOT NULL, "to" text NOT NULL, subject text, "templateName" text,
    payload jsonb NOT NULL, status "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING', "lastError" text,
    "nextAttemptAt" timestamptz, "lockedAt" timestamptz, "leaseUntil" timestamptz, "workerId" text,
    "idempotencyKey" text NOT NULL UNIQUE, "messageConversationId" uuid, "messageRecipientUserId" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "LoiNegotiation" (
    id uuid PRIMARY KEY, "buyerUserId" uuid NOT NULL, "sellerUserId" uuid NOT NULL, "currentRevisionId" uuid,
    status "LoiNegotiationStatus" NOT NULL, "closedReason" "LoiClosedReason", "closedAt" timestamptz,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "LoiRevision" (id uuid PRIMARY KEY, "negotiationId" uuid NOT NULL, "responseDeadline" timestamptz);
  CREATE TABLE "LoiEvent" (
    id uuid PRIMARY KEY, "negotiationId" uuid NOT NULL, "revisionId" uuid, type "LoiEventType" NOT NULL,
    "clientActionId" uuid NOT NULL, metadata jsonb NOT NULL, "createdAt" timestamptz NOT NULL
  );
  CREATE TABLE "LoiDraft" ("negotiationId" uuid NOT NULL);
`;

const FIXTURE = `
  INSERT INTO "User" (id, email, name, "avatarVariant", roles, status) VALUES
    ('${sellerId}', 'seller@example.test', 'Sam Seller', 'avatarka:animals:1', ARRAY['SELLER']::"UserRole"[], 'ACTIVE'),
    ('${buyerId}', 'buyer@example.test', 'Bea Buyer', 'avatarka:animals:2', ARRAY['BUYER']::"UserRole"[], 'ACTIVE'),
    ('${outsiderId}', 'outsider@example.test', 'Olly Outsider', 'avatarka:animals:3', ARRAY['BUYER', 'SELLER']::"UserRole"[], 'ACTIVE');
  INSERT INTO "SellerAccess" ("userId", status) VALUES ('${sellerId}', 'APPROVED'), ('${outsiderId}', 'APPROVED');
  INSERT INTO "BuyerProfile" (id, "userId", "displayName", "visibilityStatus") VALUES
    ('buyer-profile', '${buyerId}', 'Bea', 'ACTIVE'),
    ('outsider-profile', '${outsiderId}', 'Olly', 'ACTIVE');
  INSERT INTO "SellerProperty" (id, "ownerUserId", status, "ownershipVerificationStatus", "identityVersion", "authorityAttestedIdentityVersion")
    VALUES ('property', '${sellerId}', 'READY_FOR_INVITES', 'APPROVED', 2, 2);
  INSERT INTO "PropertyImage" (id, "propertyId", "propertyIdentityVersion", "sortOrder") VALUES
    ('image-current', 'property', 2, 0),
    ('image-previous-identity', 'property', 1, 0);
  INSERT INTO "Invite" (id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion", status, "expiresAt")
    VALUES ('${inviteId}', '${sellerId}', 'buyer-profile', 'property', 2, 'SENT', now() + interval '7 days');
  INSERT INTO "Conversation" (id, "inviteId", status, "propertySnapshot", "lastMessageAt")
    VALUES ('${conversationId}', '${inviteId}', 'AWAITING_BUYER',
      '{"addressLine1": "100 Proof Way", "location": "Los Angeles, CA", "propertyIdentityVersion": 2}'::jsonb,
      now() - interval '1 hour');
  INSERT INTO "ConversationParticipant" ("conversationId", "userId", role, "createdAt") VALUES
    ('${conversationId}', '${sellerId}', 'SELLER', now() - interval '1 hour'),
    ('${conversationId}', '${buyerId}', 'BUYER', now() - interval '1 hour');
  INSERT INTO "Message" (id, "conversationId", "senderUserId", kind, "templateKey", "templateVersion", body, "clientMessageId", "createdAt")
    VALUES ('${inviteMessageId}', '${conversationId}', '${sellerId}', 'INVITE', 'SELLER_MORE_DETAILS', 1,
      'Seller invite', gen_random_uuid(), now() - interval '1 hour');
`;
