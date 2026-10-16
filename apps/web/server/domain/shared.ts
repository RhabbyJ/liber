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

export const ADMIN_PAGE_SIZE = 50;

export class InvalidPageCursorError extends Error {
  constructor() {
    super("Invalid page.");
    this.name = "InvalidPageCursorError";
  }
}

const cursorFormats = {
  // Application user ids are Supabase Auth UUIDs; other admin lists page by cuid-style row ids.
  rowId: /^[A-Za-z0-9_-]{1,200}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

/**
 * Prisma cursor arguments for one admin page: rows after the last row id of the
 * previous page, plus one extra row to detect a next page. Callers must order by
 * a unique tiebreaker (id) after their sort column.
 */
export function cursorPageArgs(cursor: string | undefined, format: keyof typeof cursorFormats, pageSize = ADMIN_PAGE_SIZE) {
  if (cursor !== undefined && !cursorFormats[format].test(cursor)) throw new InvalidPageCursorError();
  return { ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: pageSize + 1 };
}

export function cursorPage<T extends { id: string }>(rows: T[], pageSize = ADMIN_PAGE_SIZE) {
  const items = rows.slice(0, pageSize);
  return { items, nextCursor: rows.length > pageSize ? items[items.length - 1].id : null };
}

/** One field of an audit row's JSON metadata, or undefined when absent or not an object. */
export function auditMetadataField(metadata: unknown, key: string): unknown {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)[key]
    : undefined;
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
