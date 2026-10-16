import "server-only";

import { prisma } from "@liber/db";
import { requireSessionRole } from "../session";
import { dateKey } from "./shared";

export async function listAuditLog() {
  await requireSessionRole("ADMIN");
  const logs = await prisma.adminAuditLog.findMany({
    include: { actor: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    ok: true,
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
