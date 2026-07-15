export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  retryAfterSeconds: number;
};

export type RateLimitStore = {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
};

export function clientIpFromRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown-ip";
}

export function clientIpFromHeaders(headers: Pick<Headers, "get">) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || "unknown-ip";
}

const postgresRateLimitStore: RateLimitStore = {
  async consume(key, limit, windowMs) {
    const { prisma } = await import("@liber/db");
    const rows = await prisma.$queryRaw<Array<{
      allowed: boolean;
      limit_value: number;
      retry_after_seconds: number;
    }>>`
      SELECT *
      FROM app_private.consume_rate_limit(${key}, ${limit}, ${windowMs})
    `;
    const row = rows[0];
    if (!row) throw new Error("Rate limiter did not return a result.");
    return {
      allowed: row.allowed,
      limit: Number(row.limit_value),
      retryAfterSeconds: Number(row.retry_after_seconds),
    };
  },
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  store: RateLimitStore = postgresRateLimitStore,
) {
  return store.consume(key, limit, windowMs);
}

export async function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  store: RateLimitStore = postgresRateLimitStore,
) {
  const result = await checkRateLimit(key, limit, windowMs, store);
  if (!result.allowed) throw new Error("Rate limit reached. Try again later.");
  return result;
}
