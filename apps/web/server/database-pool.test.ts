import { EventEmitter } from "node:events";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  DATABASE_CONNECTION_TIMEOUT_MS,
  DATABASE_IDLE_TIMEOUT_MS,
  DATABASE_QUERY_TIMEOUT_MS,
  databasePoolConfig,
  TransactionSafePool,
} from "@liber/db/src/pool";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/liber_test";

// Stands in for pg.Client so pool checkout and release run without a server.
class FakeClient extends EventEmitter {
  static created: FakeClient[] = [];
  _queryable = true;
  _ending = false;
  ended = false;
  transactionStatus: string | null = "I";

  constructor() {
    super();
    FakeClient.created.push(this);
  }

  connect(callback: (error?: Error) => void) {
    queueMicrotask(() => callback());
  }

  getTransactionStatus() {
    return this.transactionStatus;
  }

  end(callback?: () => void) {
    this.ended = true;
    this._ending = true;
    callback?.();
  }
}

const pools: pg.Pool[] = [];
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
  FakeClient.created = [];
});

function fakePool() {
  const pool = new TransactionSafePool({
    ...databasePoolConfig({ DATABASE_URL: databaseUrl }),
    Client: FakeClient as unknown as pg.PoolConfig["Client"],
  });
  pools.push(pool);
  return pool;
}

describe("database pool configuration", () => {
  it("bounds connecting, idling, and every statement without pooler-unsafe startup settings", () => {
    const config = databasePoolConfig({ DATABASE_URL: databaseUrl });

    expect(config).toEqual({
      connectionString: databaseUrl,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
      max: 2,
      query_timeout: DATABASE_QUERY_TIMEOUT_MS,
    });
    expect([DATABASE_CONNECTION_TIMEOUT_MS, DATABASE_IDLE_TIMEOUT_MS, DATABASE_QUERY_TIMEOUT_MS])
      .toEqual([10_000, 10_000, 15_000]);
    // Supavisor ignores these startup parameters and PgBouncer rejects them.
    expect(config).not.toHaveProperty("statement_timeout");
    expect(config).not.toHaveProperty("options");
  });

  it("keeps the configurable pool size", () => {
    expect(databasePoolConfig({ DATABASE_POOL_MAX: "5", DATABASE_URL: databaseUrl }).max).toBe(5);
    expect(databasePoolConfig({ DATABASE_POOL_MAX: "0", DATABASE_URL: databaseUrl }).max).toBe(2);
    expect(databasePoolConfig({ DATABASE_POOL_MAX: "many", DATABASE_URL: databaseUrl }).max).toBe(2);
    expect(() => databasePoolConfig({})).toThrow("DATABASE_URL is required.");
  });
});

describe("transaction-safe pool", () => {
  it("reuses a client released after its transaction finished", async () => {
    const pool = fakePool();
    const first = await pool.connect();
    first.release();
    const second = await pool.connect();
    second.release();

    expect(second).toBe(first);
    expect(FakeClient.created).toHaveLength(1);
    expect(FakeClient.created[0]?.ended).toBe(false);
  });

  it.each(["T", "E"])("destroys a client released inside an unfinished transaction (%s)", async (status) => {
    const pool = fakePool();
    const stuck = await pool.connect();
    (stuck as unknown as FakeClient).transactionStatus = status;
    stuck.release();
    const next = await pool.connect();
    next.release();

    expect(next).not.toBe(stuck);
    expect(FakeClient.created).toHaveLength(2);
    expect(FakeClient.created[0]?.ended).toBe(true);
  });

  it("still destroys a client released with an error and guards callback checkouts too", async () => {
    const pool = fakePool();
    const failed = await pool.connect();
    failed.release(new Error("connection lost"));
    expect((failed as unknown as FakeClient).ended).toBe(true);

    // pg-pool's own query() checks out this way.
    const checkout = await new Promise<{ client: pg.PoolClient; done: () => void }>((resolve, reject) => {
      pool.connect((error, client, done) => (error || !client ? reject(error) : resolve({ client, done })));
    });
    (checkout.client as unknown as FakeClient).transactionStatus = "T";
    checkout.done();
    expect((checkout.client as unknown as FakeClient).ended).toBe(true);
  });
});
