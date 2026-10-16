import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const PASSWORD_RESET_PATH = "/reset-password";
export const PASSWORD_RECOVERY_COOKIE = "liber-password-recovery";
/** How long a verified reset link may be used to choose a new password. */
export const PASSWORD_RECOVERY_WINDOW_SECONDS = 30 * 60;

const MARKER_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

/**
 * A Supabase recovery link signs the browser in with an ordinary session, so the session
 * alone cannot tell /reset-password that the user proved control of the mailbox. The Auth
 * callback sets this short-lived, signed marker only after Supabase verified a recovery link.
 * The value is `expiresAt.signature`; the user id is bound by the signature, never stored.
 */
export function createPasswordRecoveryMarker(userId: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + PASSWORD_RECOVERY_WINDOW_SECONDS;
  return `${expiresAt}.${markerSignature(userId, expiresAt)}`;
}

export function isValidPasswordRecoveryMarker(value: string | null | undefined, userId: string, now = Date.now()) {
  const match = value ? MARKER_PATTERN.exec(value) : null;
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt <= nowSeconds || expiresAt > nowSeconds + PASSWORD_RECOVERY_WINDOW_SECONDS) return false;
  try {
    return safeEqual(match[2], markerSignature(userId, expiresAt));
  } catch {
    // A missing production secret fails closed: the reset form stays unavailable.
    return false;
  }
}

export function passwordRecoveryCookie(userId: string) {
  return {
    name: PASSWORD_RECOVERY_COOKIE,
    options: {
      httpOnly: true,
      maxAge: PASSWORD_RECOVERY_WINDOW_SECONDS,
      // The reset page and its server action both live at this path.
      path: PASSWORD_RESET_PATH,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    },
    value: createPasswordRecoveryMarker(userId),
  };
}

export async function hasPasswordRecoveryFor(userId: string) {
  const cookieStore = await cookies();
  return isValidPasswordRecoveryMarker(cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value, userId);
}

export async function clearPasswordRecovery() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: PASSWORD_RECOVERY_COOKIE, path: PASSWORD_RESET_PATH });
}

function markerSignature(userId: string, expiresAt: number) {
  return createHmac("sha256", markerSecret())
    .update(`liber-password-recovery:v1:${userId}:${expiresAt}`)
    .digest("base64url");
}

// Shares the server-only Auth pepper with the shared rate limiter and messaging cursors;
// the message prefix keeps each use separate.
function markerSecret() {
  const production = process.env.NODE_ENV === "production";
  const secret = process.env.AUTH_RATE_LIMIT_PEPPER || (production ? "" : "liber-local-password-recovery-v1");
  if (!secret || (production && secret.length < 32)) {
    throw new Error("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters in production.");
  }
  return secret;
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}
