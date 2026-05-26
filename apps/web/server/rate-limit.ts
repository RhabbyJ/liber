type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __liberRateLimitBuckets?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.__liberRateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.__liberRateLimitBuckets = buckets;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  retryAfterSeconds: number;
};

export function clientIpFromRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown-ip";
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, limit, retryAfterSeconds: 0 };
}

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new Error("Rate limit reached. Try again later.");
  }
  return result;
}
