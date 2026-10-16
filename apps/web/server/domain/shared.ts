import "server-only";

import { prisma, type Prisma } from "@liber/db";
import { redirect } from "next/navigation";
import type { SessionUser } from "../authz";
import { getSessionUser } from "../session";

export async function requireAuthenticatedUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function toNumber(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}

export function dateKey(value?: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function expiresInDays(value?: Date | null) {
  if (!value) return undefined;
  return Math.ceil((value.getTime() - Date.now()) / 86_400_000);
}

export async function auditSecurityEvent(
  user: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.adminAuditLog.create({
    data: {
      action,
      actorUserId: user.id,
      metadata,
      targetId,
      targetType,
    },
  });
}
