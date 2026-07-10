import { prisma } from "@liber/db";
import { createHmac } from "node:crypto";
import { normalizeIdentityEmail } from "../lib/auth-identity";
import { checkRateLimit, type RateLimitResult } from "./rate-limit";

export type AuthRateLimitAction = "login" | "recovery" | "resend" | "signup";

type AuthRateLimitConfig = {
  email: { limit: number; windowSeconds: number };
  ip: { limit: number; windowSeconds: number };
};

const AUTH_LIMITS: Record<AuthRateLimitAction, AuthRateLimitConfig> = {
  login: {
    email: { limit: 10, windowSeconds: 60 },
    ip: { limit: 10, windowSeconds: 60 },
  },
  recovery: {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 5, windowSeconds: 60 * 60 },
  },
  resend: {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 5, windowSeconds: 60 * 60 },
  },
  signup: {
    email: { limit: 3, windowSeconds: 60 * 60 },
    ip: { limit: 5, windowSeconds: 10 * 60 },
  },
};

type SharedRateLimitRow = {
  allowed: boolean;
  limit_value: number;
  retry_after_seconds: number;
};

export async function enforceSharedAuthRateLimit(args: {
  action: AuthRateLimitAction;
  email?: string | null;
  ip: string;
}): Promise<RateLimitResult> {
  const ipConfig = AUTH_LIMITS[args.action].ip;
  const ipResult = await consumeSharedBucket(
    `auth:${args.action}:ip`,
    hashIdentifier(args.ip.trim() || "unknown-ip"),
    ipConfig.limit,
    ipConfig.windowSeconds,
  );
  if (!ipResult.allowed) return ipResult;

  const email = normalizeIdentityEmail(args.email);
  if (!email) return ipResult;
  const emailConfig = AUTH_LIMITS[args.action].email;
  return consumeSharedBucket(
    `auth:${args.action}:email`,
    hashIdentifier(email),
    emailConfig.limit,
    emailConfig.windowSeconds,
  );
}

export function authRateLimitConfig(action: AuthRateLimitAction) {
  return AUTH_LIMITS[action];
}

async function consumeSharedBucket(
  namespace: string,
  keyHash: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const rows = await prisma.$queryRaw<SharedRateLimitRow[]>`
      SELECT allowed, limit_value, retry_after_seconds
      FROM app_private.consume_rate_limit(
        ${namespace},
        ${keyHash},
        ${limit},
        ${windowSeconds}
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("Shared auth rate limiter returned no result.");
    return {
      allowed: row.allowed,
      limit: row.limit_value,
      retryAfterSeconds: row.retry_after_seconds,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Shared auth rate limiting is unavailable.", { cause: error });
    }
    return checkRateLimit(`${namespace}:${keyHash}`, limit, windowSeconds * 1000);
  }
}

function hashIdentifier(value: string) {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  if (process.env.NODE_ENV === "production" && (!pepper || pepper.length < 32)) {
    throw new Error("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters in production.");
  }
  return createHmac("sha256", pepper || "liber-local-auth-rate-limit")
    .update(value)
    .digest("hex");
}
