import { prisma } from "@liber/db";
import {
  classifyAuthIdentity,
  normalizeIdentityEmail,
  rolesAfterSelfSelection,
  type AppIdentityRecord,
  type AuthIdentityResolution,
} from "../lib/auth-identity";
import type { AppRole } from "./authz";

export { normalizeIdentityEmail } from "../lib/auth-identity";

export class AuthIdentityLinkError extends Error {
  constructor(readonly code: "collision" | "inactive" | "missing") {
    super(
      code === "collision"
        ? "Identity recovery is required."
        : code === "inactive"
          ? "The Liber identity is inactive."
          : "Auth identity is not linked to Liber.",
    );
    this.name = "AuthIdentityLinkError";
  }
}

export type SignupFailureStatus =
  | "account-exists"
  | "identity-recovery-required"
  | "invalid-email"
  | "rate-limited"
  | "signup-error"
  | "weak-password";

type SupabaseSignupFailure = {
  code?: string;
  status?: number;
};

const RATE_LIMIT_AUTH_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

export async function resolveAuthIdentity(authUser: {
  email?: string | null;
  id: string;
}): Promise<AuthIdentityResolution> {
  const email = normalizeIdentityEmail(authUser.email);
  const [appUserById, appUserByEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { id: authUser.id },
      select: { email: true, id: true, roles: true, status: true },
    }),
    email
      ? prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        })
      : null,
  ]);

  return classifyAuthIdentity(authUser, appUserById, appUserByEmail);
}

export async function signupStatusForAuthFailure(
  error: SupabaseSignupFailure,
  emailInput: string,
): Promise<SignupFailureStatus> {
  if (error.status === 429 || (error.code && RATE_LIMIT_AUTH_CODES.has(error.code))) {
    return "rate-limited";
  }
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "account-exists";
  }
  if (error.code === "weak_password") return "weak-password";
  if (error.code === "email_address_invalid") return "invalid-email";

  const email = normalizeIdentityEmail(emailInput);
  if (!email) return "invalid-email";
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM public."User"
    WHERE lower(btrim(email)) = ${email}
    LIMIT 1
  `;
  return rows.length > 0 ? "identity-recovery-required" : "signup-error";
}

export async function persistUserRolesForAuthIdentity(args: {
  authUser: { email?: string | null; id: string };
  mode: "initialize" | "merge";
  name?: string | null;
  roles: AppRole[];
}) {
  return prisma.$transaction(async (tx) => {
    const lockedUsers = await tx.$queryRaw<AppIdentityRecord[]>`
      SELECT email, id, roles, status
      FROM public."User"
      WHERE id = ${args.authUser.id}::uuid
      FOR UPDATE
    `;
    const email = normalizeIdentityEmail(args.authUser.email);
    const appUserByEmail = email
      ? await tx.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    const resolution = classifyAuthIdentity(args.authUser, lockedUsers[0] ?? null, appUserByEmail);

    if (resolution.kind !== "linked") {
      throw new AuthIdentityLinkError(resolution.kind);
    }
    if (resolution.user.status !== "ACTIVE") {
      throw new AuthIdentityLinkError("inactive");
    }

    const roles = rolesAfterSelfSelection(resolution.user.roles, args.roles, args.mode);
    return tx.user.update({
      where: { id: args.authUser.id },
      data: {
        ...(args.name ? { name: args.name } : {}),
        roles,
      },
      select: { email: true, id: true, roles: true, status: true },
    });
  });
}

export async function establishVerifiedAuthSession(args: {
  authUser: { email?: string | null; id: string; user_metadata?: Record<string, unknown> };
  roles: AppRole[];
}) {
  const resolution = await resolveAuthIdentity(args.authUser);
  if (resolution.kind !== "linked") {
    throw new AuthIdentityLinkError(resolution.kind);
  }
  if (resolution.user.status !== "ACTIVE") {
    throw new AuthIdentityLinkError("inactive");
  }
  if (resolution.user.roles.length > 0 || args.roles.length === 0) {
    return resolution.user;
  }

  const privateName = args.authUser.user_metadata?.name;
  return persistUserRolesForAuthIdentity({
    authUser: args.authUser,
    mode: "initialize",
    name: typeof privateName === "string" ? privateName.trim() : null,
    roles: args.roles,
  });
}
