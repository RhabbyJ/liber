import pg from "pg";

// Vercel functions reach Postgres through Supabase's transaction pooler
// (Supavisor). The pooler does not apply per-connection startup settings such
// as statement_timeout, and PgBouncer-based poolers reject them, so the
// statement bound is enforced here: query_timeout fails any statement the
// function has waited on for 15 seconds. The server keeps its own cap (two
// minutes for the postgres role on Supabase).
export const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;
export const DATABASE_IDLE_TIMEOUT_MS = 10_000;
export const DATABASE_QUERY_TIMEOUT_MS = 15_000;
const DEFAULT_POOL_MAX = 2;

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export function databasePoolConfig(env: DatabaseEnvironment = process.env): pg.PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const poolMax = Number.parseInt(env.DATABASE_POOL_MAX ?? "", 10);
  return {
    connectionString,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : DEFAULT_POOL_MAX,
    // Covers the TLS connect and waiting for a free pool slot.
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    // Closes idle pooler connections soon after a burst on a warm instance.
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
  };
}

type CheckoutCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;
type TransactionStatusClient = { getTransactionStatus?: () => string | null };

/**
 * A query timeout only stops waiting; the statement keeps running. Prisma then
 * queues ROLLBACK behind it and releases the client even when that ROLLBACK
 * also times out, so the client could return to the pool inside an open
 * transaction and silently absorb the next request's writes. A client released
 * while its last reported state is inside (or failing) a transaction is
 * destroyed instead, which makes the server roll that transaction back.
 */
export class TransactionSafePool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: CheckoutCallback): void;
  override connect(callback?: CheckoutCallback): Promise<pg.PoolClient> | void {
    if (!callback) return super.connect().then(guardRelease);
    return super.connect((error, client, done) => {
      if (!client) return callback(error, client, done);
      guardRelease(client);
      // pg-pool destroys the client for any truthy release argument.
      return callback(error, client, (release?: unknown) => client.release(
        release instanceof Error ? release : Boolean(release),
      ));
    });
  }
}

function guardRelease(client: pg.PoolClient) {
  const release = client.release;
  client.release = (error?: Error | boolean) => {
    const status = (client as unknown as TransactionStatusClient).getTransactionStatus?.();
    release(error || (status === "T" || status === "E"
      ? new Error("Database client released inside an unfinished transaction.")
      : undefined));
  };
  return client;
}

export function createDatabasePool(env: DatabaseEnvironment = process.env) {
  return new TransactionSafePool(databasePoolConfig(env));
}
