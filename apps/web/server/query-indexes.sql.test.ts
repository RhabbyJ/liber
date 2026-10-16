import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@liber/db", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("./email", () => ({ sendInviteEmail: vi.fn(), sendLoiUpdateEmail: vi.fn(), sendUnreadMessageEmail: vi.fn() }));
vi.mock("./messaging/tours", () => ({ prepareTourEmail: vi.fn(), sendCurrentTourEmail: vi.fn() }));

import { claimEmailJobs } from "./email-outbox";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const indexMigration = readFileSync(
  path.join(
    repositoryRoot,
    "packages/db/prisma/migrations/20261016050000_index_notification_feed_and_outbox_claims/migration.sql",
  ),
  "utf8",
);
const feedUserId = "019f62c5-1c07-4a62-9f9a-8302778aa021";
let database: PGlite;

// Prisma's pg adapter sends unnamed statements, which PostgreSQL plans with the
// bound values; PGlite's parameterized queries behave the same way.
async function execute(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.reduce((text, segment, index) => text + (index ? `$${index}` : "") + segment, "");
  return (await database.query(sql, values)).rows;
}

async function explain(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.reduce((text, segment, index) => text + (index ? `$${index}` : "") + segment, "");
  const { rows } = await database.query<{ "QUERY PLAN": unknown }>(`EXPLAIN (FORMAT JSON) ${sql}`, values);
  return JSON.stringify(rows[0]?.["QUERY PLAN"]);
}

describe("indexes for the notification feed and outbox claims", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
      CREATE TABLE "EmailOutbox" (
        id text PRIMARY KEY, type text NOT NULL, attempts integer NOT NULL DEFAULT 0,
        status "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING', "nextAttemptAt" timestamp(3),
        "leaseUntil" timestamp(3), "lockedAt" timestamp(3), "workerId" text, "lastError" text,
        "idempotencyKey" text NOT NULL,
        "inviteId" text, "messageConversationId" uuid, "messageRecipientUserId" uuid,
        "loiNegotiationId" uuid, "loiRevisionId" uuid, "loiRecipientUserId" uuid,
        "tourScheduleId" uuid, "tourRevision" integer, "tourRecipientUserId" uuid, "tourEvent" text,
        "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL
      );
      CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox" (status, "nextAttemptAt");
      CREATE INDEX "EmailOutbox_status_leaseUntil_idx" ON "EmailOutbox" (status, "leaseUntil");
      CREATE INDEX "EmailOutbox_createdAt_idx" ON "EmailOutbox" ("createdAt");
      CREATE TABLE "Notification" (
        id text PRIMARY KEY, "userId" uuid NOT NULL, type text NOT NULL, title text NOT NULL,
        body text NOT NULL, "readAt" timestamp(3), metadata jsonb, "createdAt" timestamp(3) NOT NULL
      );
      CREATE INDEX "Notification_userId_readAt_idx" ON "Notification" ("userId", "readAt");

      -- Years of finished history, a few permanently failed jobs, and a short live queue.
      INSERT INTO "EmailOutbox" (id, type, attempts, status, "idempotencyKey", "createdAt", "updatedAt")
      SELECT 'finished-' || value, 'INVITE', 1, CASE WHEN value % 5 = 0 THEN 'CANCELLED' ELSE 'SENT' END::"EmailOutboxStatus",
        'finished-' || value, timestamp '2024-01-01' + value * interval '1 minute', now()
      FROM generate_series(1, 20000) AS value;
      INSERT INTO "EmailOutbox" (id, type, attempts, status, "idempotencyKey", "createdAt", "updatedAt")
      SELECT 'exhausted-' || value, 'INVITE', 5, 'FAILED', 'exhausted-' || value,
        timestamp '2023-06-01' + value * interval '1 minute', now()
      FROM generate_series(1, 300) AS value;
      INSERT INTO "EmailOutbox" (id, type, status, "idempotencyKey", "createdAt", "updatedAt")
      SELECT 'pending-' || value, 'INVITE', 'PENDING', 'pending-' || value,
        now() - (10 - value) * interval '1 second', now()
      FROM generate_series(1, 5) AS value;

      INSERT INTO "Notification" (id, "userId", type, title, body, "readAt", "createdAt")
      SELECT 'notification-' || user_number || '-' || value,
        ('019f62c5-1c07-4a62-9f9a-' || lpad(user_number::text, 12, '0'))::uuid,
        'invite_received', 'Title', 'Body',
        CASE WHEN value % 3 = 0 THEN NULL ELSE timestamp '2026-01-01' END,
        timestamp '2025-01-01' + value * interval '1 hour'
      FROM generate_series(1, 60) AS user_number, generate_series(1, 500) AS value;
      INSERT INTO "Notification" (id, "userId", type, title, body, "createdAt")
      SELECT 'feed-' || value, '${feedUserId}', 'invite_received', 'Title', 'Body',
        timestamp '2025-06-01' + value * interval '1 hour'
      FROM generate_series(1, 500) AS value;
    `);
    await database.exec(indexMigration);
    await database.exec('ANALYZE "EmailOutbox"; ANALYZE "Notification";');
  }, 60_000);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  afterAll(async () => database?.close());

  it("plans the worker claim through the claimable partial index", async () => {
    queryRaw.mockImplementation(explain);
    const plan = String(await claimEmailJobs(1, "plan-worker"));

    expect(plan).toContain('"Index Name":"EmailOutbox_claimable_createdAt_idx"');
  });

  it("still claims the oldest claimable job and never a finished or exhausted one", async () => {
    queryRaw.mockImplementation(execute);
    await database.exec("BEGIN");
    try {
      await expect(claimEmailJobs(2, "claim-worker")).resolves.toEqual([
        expect.objectContaining({ attempts: 1, id: "pending-1" }),
        expect.objectContaining({ attempts: 1, id: "pending-2" }),
      ]);
    } finally {
      await database.exec("ROLLBACK");
    }
  });

  it("reads a user's feed newest first from the index without sorting", async () => {
    const plan = await database.query<{ "QUERY PLAN": unknown }>(`
      EXPLAIN (FORMAT JSON)
      SELECT id, type, title, body, metadata, "readAt", "createdAt"
      FROM "Notification"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 200
    `, [feedUserId]);
    const text = JSON.stringify(plan.rows[0]?.["QUERY PLAN"]);

    expect(text).toContain('"Index Name":"Notification_userId_createdAt_id_idx"');
    expect(text).not.toContain('"Node Type":"Sort"');
  });
});
