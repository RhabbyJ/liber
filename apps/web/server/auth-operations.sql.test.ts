import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    authOperation: { updateMany: vi.fn() },
    workerHeartbeat: { upsert: vi.fn() },
  },
  updateUserById: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
vi.mock("./supabase", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { updateUserById: mocks.updateUserById } } }),
}));

import { claimAuthOperations, processAuthOperations } from "./auth-operations";

const userId = "019f62c5-1c07-4a62-9f9a-8302778aa012";
// Independent accounts, so per-account ordering never couples unrelated operations.
const accountIds = [userId, ...Array.from({ length: 4 }, (_, index) => `019f62c5-1c07-4a62-9f9a-8302778aa0${20 + index}`)];
let database: PGlite;

describe("Auth operation leases in isolated PostgreSQL", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TYPE "AuthOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
      CREATE TABLE "User" (id uuid PRIMARY KEY, status text NOT NULL);
      CREATE TABLE "AuthOperation" (
        id text PRIMARY KEY, "userId" uuid NOT NULL, type text NOT NULL,
        status "AuthOperationStatus" NOT NULL DEFAULT 'PENDING', attempts integer NOT NULL DEFAULT 0,
        "lastError" text, "nextAttemptAt" timestamptz, "lockedAt" timestamptz,
        "leaseUntil" timestamptz, "workerId" text, "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }, 30_000);

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.prisma.$queryRaw.mockImplementation(executeQuery);
    mocks.prisma.authOperation.updateMany.mockImplementation(updateOperations);
    mocks.prisma.workerHeartbeat.upsert.mockResolvedValue({});
    mocks.updateUserById.mockResolvedValue({ error: null });
    await database.exec("BEGIN");
    for (const id of accountIds) await database.query('INSERT INTO "User" (id, status) VALUES ($1, \'SUSPENDED\')', [id]);
  });

  afterEach(async () => database.exec("ROLLBACK"));
  afterAll(async () => database?.close());

  it("completes a BAN_USER operation and records only the committed transition", async () => {
    await seedOperations("ban-user");

    await expect(processAuthOperations(1, "worker")).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(mocks.updateUserById).toHaveBeenCalledWith(userId, { ban_duration: "876000h" });
    const { rows } = await database.query('SELECT status, attempts, "completedAt", "lockedAt", "leaseUntil", "workerId" FROM "AuthOperation"');
    expect(rows).toEqual([{
      status: "COMPLETED", attempts: 1, completedAt: expect.any(Date),
      lockedAt: null, leaseUntil: null, workerId: null,
    }]);
    expect(mocks.prisma.workerHeartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { lastRunAt: expect.any(Date), metadata: { completed: 1, failed: 0, processed: 1 } },
    }));
  });

  it("lifts the Auth ban for a reinstated account", async () => {
    await setAccountStatus(userId, "ACTIVE");
    await seedOperation("unban-user", { type: "UNBAN_USER" });

    await expect(processAuthOperations(1, "worker")).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(mocks.updateUserById).toHaveBeenCalledWith(userId, { ban_duration: "none" });
    const { rows } = await database.query('SELECT status, "lastError" FROM "AuthOperation"');
    expect(rows).toEqual([{ status: "COMPLETED", lastError: null }]);
  });

  it.each([
    ["BAN_USER", "ACTIVE"],
    ["UNBAN_USER", "SUSPENDED"],
  ])("settles a stale %s without calling Auth once the account is %s", async (type, status) => {
    await setAccountStatus(userId, status);
    await seedOperation("stale-operation", { type });

    await expect(processAuthOperations(1, "worker")).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    const { rows } = await database.query('SELECT status, "lastError", "workerId", "leaseUntil" FROM "AuthOperation"');
    expect(rows).toEqual([{
      status: "COMPLETED", lastError: "Superseded by a later account status change; Auth was not called.", workerId: null, leaseUntil: null,
    }]);
  });

  it("rejects an unknown operation type as a retryable failure", async () => {
    await seedOperation("unknown-operation", { type: "DELETE_USER" });
    await expect(processAuthOperations(1, "worker")).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    const { rows } = await database.query('SELECT status, "lastError" FROM "AuthOperation"');
    expect(rows).toEqual([{ status: "FAILED", lastError: "Unsupported Auth operation: DELETE_USER" }]);
  });

  it("runs one account's operations in creation order", async () => {
    await seedOperation("older-ban", { ageSeconds: 60 });
    await seedOperation("newer-unban", { type: "UNBAN_USER" });
    await seedOperation("other-account-ban", { user: accountIds[1], ageSeconds: 30 });
    await database.exec(`
      UPDATE "AuthOperation" SET status = 'PROCESSING', attempts = 1,
        "workerId" = 'slow-worker', "lockedAt" = now(), "leaseUntil" = now() + interval '1 minute'
      WHERE id = 'older-ban';
    `);

    // The newer unban waits behind the in-flight ban; another account's work does not.
    await expect(claimAuthOperations(2, "next-worker")).resolves.toEqual([
      expect.objectContaining({ id: "other-account-ban" }),
    ]);
    await database.exec(`UPDATE "AuthOperation" SET status = 'COMPLETED', "leaseUntil" = NULL, "workerId" = NULL WHERE id = 'older-ban'`);
    await expect(claimAuthOperations(1, "next-worker")).resolves.toEqual([
      expect.objectContaining({ id: "newer-unban", type: "UNBAN_USER", userId }),
    ]);
  });

  it("waits behind an older retryable failure but not behind a terminal one", async () => {
    await seedOperation("older-ban", { ageSeconds: 60 });
    await seedOperation("newer-unban", { type: "UNBAN_USER" });
    await database.exec(`
      UPDATE "AuthOperation" SET status = 'FAILED', attempts = 3, "nextAttemptAt" = now() + interval '10 minutes'
      WHERE id = 'older-ban';
    `);
    await expect(claimAuthOperations(1, "worker")).resolves.toEqual([]);

    await database.exec(`UPDATE "AuthOperation" SET attempts = 8, "nextAttemptAt" = NULL WHERE id = 'older-ban'`);
    await expect(claimAuthOperations(1, "worker")).resolves.toEqual([expect.objectContaining({ id: "newer-unban" })]);
  });

  it("leaves waiting operations available while another worker's Auth request is slow", async () => {
    await seedOperations("slow-operation", "waiting-operation");
    let finishFirst!: () => void;
    let providerStarted!: () => void;
    const providerReady = new Promise<void>((resolve) => { providerStarted = resolve; });
    const providerRelease = new Promise<void>((resolve) => { finishFirst = resolve; });
    mocks.updateUserById.mockImplementationOnce(async () => {
      providerStarted();
      await providerRelease;
      return { error: null };
    });

    const firstWorker = processAuthOperations(2, "slow-worker");
    await providerReady;
    try {
      await expect(processAuthOperations(1, "second-worker")).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    } finally {
      finishFirst();
      await firstWorker;
    }
    expect(mocks.updateUserById).toHaveBeenCalledTimes(2);
    const { rows } = await database.query('SELECT status, attempts FROM "AuthOperation"');
    expect(rows).toEqual([{ status: "COMPLETED", attempts: 1 }, { status: "COMPLETED", attempts: 1 }]);
  });

  it("does not call Auth if its lease expires before submission", async () => {
    await seedOperations("expired-before-ban");
    mocks.prisma.$queryRaw.mockImplementationOnce(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const rows = await executeQuery(strings, ...values);
      await expireLease();
      return rows;
    });

    await expect(processAuthOperations(1, "old-worker")).resolves.toEqual({ completed: 0, failed: 0, processed: 1 });
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    await expect(claimAuthOperations(1, "new-worker")).resolves.toMatchObject([{ id: "expired-before-ban", attempts: 2 }]);
  });

  it.each(["success", "failure"])("does not overwrite a reclaimed operation after a delayed Auth %s", async (outcome) => {
    await seedOperations("reclaimed-operation");
    mocks.updateUserById.mockImplementationOnce(async () => {
      await expireLease();
      // Reusing the worker name proves attempts fence different claims by the same worker.
      await claimAuthOperations(1, "same-worker");
      return { error: outcome === "failure" ? { message: "Auth unavailable." } : null };
    });

    await expect(processAuthOperations(1, "same-worker")).resolves.toEqual({ completed: 0, failed: 0, processed: 1 });
    const { rows } = await database.query('SELECT status, attempts, "workerId", "completedAt", "lastError" FROM "AuthOperation"');
    expect(rows).toEqual([{
      status: "PROCESSING", attempts: 2, workerId: "same-worker", completedAt: null, lastError: null,
    }]);
    expect(mocks.prisma.workerHeartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { lastRunAt: expect.any(Date), metadata: { completed: 0, failed: 0, processed: 1 } },
    }));
  });

  it.each(["success", "failure"])("does not finalize an expired claim after an Auth %s even before reclamation", async (outcome) => {
    await seedOperations("expired-during-ban");
    mocks.updateUserById.mockImplementationOnce(async () => {
      await expireLease();
      if (outcome === "failure") throw new Error("Auth timed out.");
      return { error: null };
    });

    await expect(processAuthOperations(1, "expired-worker")).resolves.toEqual({ completed: 0, failed: 0, processed: 1 });
    const { rows } = await database.query('SELECT status, attempts, "completedAt", "lastError" FROM "AuthOperation"');
    expect(rows).toEqual([{ status: "PROCESSING", attempts: 1, completedAt: null, lastError: null }]);
  });

  it("terminalizes an expired eighth claim without touching an active eighth claim", async () => {
    await seedOperations("exhausted-operation", "active-operation", "pending-operation");
    await database.exec(`
      UPDATE "AuthOperation" SET status = 'PROCESSING', attempts = 8,
        "workerId" = 'old-worker', "lockedAt" = now(), "leaseUntil" = now() - interval '1 second'
      WHERE id = 'exhausted-operation';
      UPDATE "AuthOperation" SET status = 'PROCESSING', attempts = 8,
        "workerId" = 'active-worker', "lockedAt" = now(), "leaseUntil" = now() + interval '1 minute'
      WHERE id = 'active-operation';
    `);

    await expect(claimAuthOperations(1, "new-worker")).resolves.toMatchObject([{ id: "pending-operation", attempts: 1 }]);
    const { rows } = await database.query('SELECT id, status, attempts, "workerId", "lockedAt", "leaseUntil", "nextAttemptAt", "lastError" FROM "AuthOperation" ORDER BY id');
    expect(rows[0]).toMatchObject({ id: "active-operation", status: "PROCESSING", attempts: 8, workerId: "active-worker" });
    expect(rows[1]).toMatchObject({
      id: "exhausted-operation", status: "FAILED", attempts: 8, workerId: null,
      lockedAt: null, leaseUntil: null, nextAttemptAt: null,
      lastError: "Auth operation lease expired after the final attempt.",
    });
    await expect(claimAuthOperations(1, "later-worker")).resolves.toEqual([]);
  });

  it.each([0, 7])("keeps the bounded retry policy after provider failure with %i previous attempts", async (previousAttempts) => {
    await seedOperations("provider-failed");
    await database.query('UPDATE "AuthOperation" SET attempts = $1', [previousAttempts]);
    mocks.updateUserById.mockResolvedValue({ error: { message: "Auth unavailable." } });

    await expect(processAuthOperations(1, "worker")).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    const { rows } = await database.query<{ nextAttemptAt: Date | null }>('SELECT status, attempts, "workerId", "leaseUntil", "nextAttemptAt", "lastError" FROM "AuthOperation"');
    expect(rows[0]).toMatchObject({
      status: "FAILED", attempts: previousAttempts + 1, workerId: null, leaseUntil: null, lastError: "Auth unavailable.",
    });
    if (previousAttempts === 7) expect(rows[0].nextAttemptAt).toBeNull();
    else expect(rows[0].nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
    await expect(claimAuthOperations(1, "later-worker")).resolves.toEqual([]);
  });
});

async function executeQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.reduce((query, segment, index) => query + (index ? `$${index}` : "") + segment, "");
  return (await database.query(sql, values)).rows;
}

async function updateOperations({ where, data }: {
  where: Record<string, string | number | { gt: Date }>;
  data: Record<string, string | number | Date | null>;
}) {
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
  const result = await database.query(`UPDATE "AuthOperation" SET ${set.join(", ")} WHERE ${predicates.join(" AND ")} RETURNING id`, values);
  return { count: result.rows.length };
}

/** Seeds one BAN_USER operation per id, each for a different suspended account. */
async function seedOperations(...ids: string[]) {
  for (const [index, id] of ids.entries()) await seedOperation(id, { user: accountIds[index] });
}

async function seedOperation(id: string, { user = userId, type = "BAN_USER", ageSeconds = 0 } = {}) {
  await database.query(
    'INSERT INTO "AuthOperation" (id, "userId", type, "createdAt") VALUES ($1, $2, $3, now() - make_interval(secs => $4))',
    [id, user, type, ageSeconds],
  );
}

async function setAccountStatus(id: string, status: string) {
  await database.query('UPDATE "User" SET status = $2 WHERE id = $1', [id, status]);
}

async function expireLease() {
  await database.exec('UPDATE "AuthOperation" SET "leaseUntil" = now() - interval \'1 second\'');
}
