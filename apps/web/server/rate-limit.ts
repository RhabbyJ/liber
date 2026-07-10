type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __liberRateLimitBuckets?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.__liberRateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.__liberRateLimitBuckets = buckets;
const MAX_LOCAL_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  retryAfterSeconds: number;
};

export function clientIpFromRequest(request: Request) {
  return clientIpFromHeaders(request.headers);
}

export function clientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || "unknown-ip";
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (bucket) buckets.delete(key);
    pruneLocalBuckets(now);
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

function pruneLocalBuckets(now: number) {
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  while (buckets.size >= MAX_LOCAL_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (typeof oldestKey !== "string") break;
    buckets.delete(oldestKey);
  }
}
