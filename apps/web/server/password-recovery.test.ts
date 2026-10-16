import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import {
  clearPasswordRecovery,
  createPasswordRecoveryMarker,
  hasPasswordRecoveryFor,
  isValidPasswordRecoveryMarker,
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_WINDOW_SECONDS,
  passwordRecoveryCookie,
} from "./password-recovery";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const now = Date.UTC(2026, 9, 15, 12, 0, 0);

describe("password recovery marker", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("is valid only for the user it was issued to and never contains the user id", () => {
    const marker = createPasswordRecoveryMarker(userId, now);

    expect(marker).not.toContain(userId);
    expect(isValidPasswordRecoveryMarker(marker, userId, now)).toBe(true);
    expect(isValidPasswordRecoveryMarker(marker, otherUserId, now)).toBe(false);
  });

  it("expires at the end of the recovery window", () => {
    const marker = createPasswordRecoveryMarker(userId, now);
    const windowMs = PASSWORD_RECOVERY_WINDOW_SECONDS * 1000;

    expect(isValidPasswordRecoveryMarker(marker, userId, now + windowMs - 1000)).toBe(true);
    expect(isValidPasswordRecoveryMarker(marker, userId, now + windowMs)).toBe(false);
  });

  it("rejects missing, malformed, tampered, and far-future markers", () => {
    const marker = createPasswordRecoveryMarker(userId, now);
    const [expiresAt, signature] = marker.split(".");
    const flipped = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(isValidPasswordRecoveryMarker(undefined, userId, now)).toBe(false);
    expect(isValidPasswordRecoveryMarker("", userId, now)).toBe(false);
    expect(isValidPasswordRecoveryMarker("recovery", userId, now)).toBe(false);
    expect(isValidPasswordRecoveryMarker(`${expiresAt}.${flipped}`, userId, now)).toBe(false);
    expect(isValidPasswordRecoveryMarker(`${Number(expiresAt) - 60}.${signature}`, userId, now)).toBe(false);
    const farFuture = createPasswordRecoveryMarker(userId, now + 24 * 60 * 60 * 1000);
    expect(isValidPasswordRecoveryMarker(farFuture, userId, now)).toBe(false);
  });

  it("is a short-lived httpOnly cookie scoped to the reset page", () => {
    const cookie = passwordRecoveryCookie(userId);

    expect(cookie.name).toBe(PASSWORD_RECOVERY_COOKIE);
    expect(cookie.options).toMatchObject({
      httpOnly: true,
      maxAge: PASSWORD_RECOVERY_WINDOW_SECONDS,
      path: "/reset-password",
      sameSite: "lax",
    });
    expect(isValidPasswordRecoveryMarker(cookie.value, userId)).toBe(true);
  });

  it("signs with the server Auth pepper in production and fails closed without it", () => {
    const developmentMarker = createPasswordRecoveryMarker(userId, now);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "");

    expect(() => createPasswordRecoveryMarker(userId, now)).toThrow("AUTH_RATE_LIMIT_PEPPER");
    expect(isValidPasswordRecoveryMarker(developmentMarker, userId, now)).toBe(false);

    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "production-test-pepper-at-least-32-characters");
    const productionMarker = createPasswordRecoveryMarker(userId, now);
    expect(productionMarker).not.toBe(developmentMarker);
    expect(isValidPasswordRecoveryMarker(productionMarker, userId, now)).toBe(true);
    expect(isValidPasswordRecoveryMarker(developmentMarker, userId, now)).toBe(false);
  });

  it("reads the marker from the request cookies and clears it on the reset path", async () => {
    cookieStore.get.mockReturnValue({ name: PASSWORD_RECOVERY_COOKIE, value: createPasswordRecoveryMarker(userId) });
    await expect(hasPasswordRecoveryFor(userId)).resolves.toBe(true);
    await expect(hasPasswordRecoveryFor(otherUserId)).resolves.toBe(false);
    expect(cookieStore.get).toHaveBeenCalledWith(PASSWORD_RECOVERY_COOKIE);

    cookieStore.get.mockReturnValue(undefined);
    await expect(hasPasswordRecoveryFor(userId)).resolves.toBe(false);

    await clearPasswordRecovery();
    expect(cookieStore.delete).toHaveBeenCalledWith({ name: PASSWORD_RECOVERY_COOKIE, path: "/reset-password" });
  });
});
