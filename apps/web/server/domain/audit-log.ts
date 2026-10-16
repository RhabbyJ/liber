import "server-only";

import { prisma } from "@liber/db";
import { requireSessionRole } from "../session";
import { cursorPage, cursorPageArgs, dateKey } from "./shared";

const AUDIT_LOG_PAGE_SIZE = 100;

export async function listAuditLog(cursor?: string) {
  await requireSessionRole("ADMIN");
  const rows = await prisma.adminAuditLog.findMany({
    include: { actor: { select: { email: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...cursorPageArgs(cursor, "rowId", AUDIT_LOG_PAGE_SIZE),
  });
  const { items: logs, nextCursor } = cursorPage(rows, AUDIT_LOG_PAGE_SIZE);
  return {
    ok: true,
    nextCursor,
    data: logs.map((log) => ({
      id: log.id,
      actor: log.actor ? log.actor.name || log.actor.email : "Deleted admin",
      action: log.action,
      target: `${log.targetType}:${log.targetId}`,
      metadata: log.metadata,
      createdAt: dateKey(log.createdAt),
    })),
  };
}
