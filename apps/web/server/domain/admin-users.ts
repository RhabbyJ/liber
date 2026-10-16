import "server-only";

import { prisma } from "@liber/db";
import { userModerationSchema } from "@liber/validators";
import { normalizeInput } from "../normalize-input";
import { assertRateLimit } from "../rate-limit";
import { reviewSellerAccessCommand } from "../seller-access-review";
import { requireSessionRole } from "../session";

export async function listUsers() {
  const admin = await requireSessionRole("ADMIN");
  const users = await prisma.user.findMany({
    include: { sellerAccess: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    ok: true,
    data: users.map((user) => ({
      id: user.id,
      isCurrentUser: user.id === admin.id,
      name: user.name || user.email,
      roles: user.roles,
      sellerAccessStatus: user.sellerAccess?.status ?? null,
      status: user.status,
    })),
  };
}

export async function reviewSellerAccess(input: unknown) {
  return reviewSellerAccessCommand(input);
}

export async function suspendUser(input: unknown) {
  const admin = await requireSessionRole("ADMIN");
  await assertRateLimit(`admin-moderation:${admin.id}`, 30, 60 * 60_000);
  const data = userModerationSchema.parse(normalizeInput(input));
  const operationId = `authop_${crypto.randomUUID()}`;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: data.userId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await tx.buyerProfile.updateMany({
      where: { userId: data.userId },
      data: { visibilityStatus: "SUSPENDED" },
    });
    await tx.sellerAccess.updateMany({
      where: { userId: data.userId },
      data: { status: "SUSPENDED" },
    });
    await tx.sellerProperty.updateMany({
      where: { ownerUserId: data.userId },
      data: { flaggedForReviewAt: new Date(), status: "ARCHIVED" },
    });
    await tx.invite.updateMany({
      where: {
        OR: [
          { sellerId: data.userId },
          { buyerProfile: { userId: data.userId } },
        ],
        status: { in: ["SENT", "VIEWED", "ACCEPTED"] },
      },
      data: { status: "WITHDRAWN" },
    });
    await tx.authOperation.upsert({
      where: { idempotencyKey: `ban-user:${data.userId}` },
      update: {},
      create: {
        id: operationId,
        idempotencyKey: `ban-user:${data.userId}`,
        status: "PENDING",
        type: "BAN_USER",
        userId: data.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "suspend_user",
        actorUserId: admin.id,
        metadata: { reason: data.reason, authOperationId: operationId },
        targetId: data.userId,
        targetType: "user",
      },
    });
  });
  return { ok: true, data };
}
