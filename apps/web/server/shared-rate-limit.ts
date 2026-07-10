import { prisma } from "@liber/db";
import { createHmac } from "node:crypto";
import { checkRateLimit, type RateLimitResult } from "./rate-limit";

type SharedRateLimitRow = {
  allowed: boolean;
  limit_value: number;
  retry_after_seconds: number;
};

export async function consumeSharedRateLimit(args: {
  identifier: string;
  limit: number;
  namespace: string;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const keyHash = hashIdentifier(args.identifier);
  try {
    const rows = await prisma.$queryRaw<SharedRateLimitRow[]>`
      SELECT allowed, limit_value, retry_after_seconds
      FROM app_private.consume_rate_limit(
        ${args.namespace},
        ${keyHash},
        ${args.limit},
        ${args.windowSeconds}
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("Shared rate limiter returned no result.");
    return {
      allowed: row.allowed,
      limit: row.limit_value,
      retryAfterSeconds: row.retry_after_seconds,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Shared rate limiting is unavailable.", { cause: error });
    }
    return checkRateLimit(
      `${args.namespace}:${keyHash}`,
      args.limit,
      args.windowSeconds * 1000,
    );
  }
}

export async function assertSharedRateLimit(args: {
  identifier: string;
  limit: number;
  namespace: string;
  windowSeconds: number;
}) {
  const result = await consumeSharedRateLimit(args);
  if (!result.allowed) throw new Error("Rate limit reached. Try again later.");
  return result;
}

function hashIdentifier(value: string) {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  if (process.env.NODE_ENV === "production" && (!pepper || pepper.length < 32)) {
    throw new Error("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters in production.");
  }
  return createHmac("sha256", pepper || "liber-local-shared-rate-limit")
    .update(value.trim() || "unknown")
    .digest("hex");
}
