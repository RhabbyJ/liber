import { normalizeIdentityEmail } from "../lib/auth-identity";
import type { RateLimitResult } from "./rate-limit";
import { consumeSharedRateLimit } from "./shared-rate-limit";

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

export async function enforceSharedAuthRateLimit(args: {
  action: AuthRateLimitAction;
  email?: string | null;
  ip: string;
}): Promise<RateLimitResult> {
  const ipConfig = AUTH_LIMITS[args.action].ip;
  const ipResult = await consumeSharedRateLimit({
    identifier: args.ip,
    limit: ipConfig.limit,
    namespace: `auth:${args.action}:ip`,
    windowSeconds: ipConfig.windowSeconds,
  });
  if (!ipResult.allowed) return ipResult;

  const email = normalizeIdentityEmail(args.email);
  if (!email) return ipResult;
  const emailConfig = AUTH_LIMITS[args.action].email;
  return consumeSharedRateLimit({
    identifier: email,
    limit: emailConfig.limit,
    namespace: `auth:${args.action}:email`,
    windowSeconds: emailConfig.windowSeconds,
  });
}

export function authRateLimitConfig(action: AuthRateLimitAction) {
  return AUTH_LIMITS[action];
}
