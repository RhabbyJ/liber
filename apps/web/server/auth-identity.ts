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
