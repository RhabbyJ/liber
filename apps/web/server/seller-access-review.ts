import { prisma } from "@liber/db";
import { sellerAccessReviewSchema, type SellerAccessReviewInput } from "@liber/validators";
import { z } from "zod";
import { normalizeInput } from "./normalize-input";
import { checkRateLimit } from "./rate-limit";
import { requireSessionRole } from "./session";

type SellerAccessReviewResult =
  | { ok: true; changed: boolean; data: SellerAccessReviewInput }
  | { ok: false; message: string };

function reviewNotification(status: SellerAccessReviewInput["status"], reason?: string) {
  if (status === "REJECTED") {
    return {
      body: `Liber didn’t approve your seller directory access. Reason: ${reason}`,
      title: "Seller access not approved",
    };
  }
  return { body: `Your seller directory access is ${status.toLowerCase()}.`, title: "Seller access reviewed" };
}

export async function reviewSellerAccessCommand(input: unknown): Promise<SellerAccessReviewResult> {
  const admin = await requireSessionRole("ADMIN");

  const limit = await checkRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { ok: false, message: `Review limit reached. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const parsed = sellerAccessReviewSchema.safeParse(normalizeInput(input));
  if (!parsed.success || !z.uuid().safeParse(parsed.data.userId).success) {
    return { ok: false, message: "Choose a seller and a valid access status, then try again." };
  }
  const data = parsed.data;
  // A rejection reason is shown to the seller, so it is required.
  if (data.status === "REJECTED" && !data.notes) {
    return { ok: false, message: "Add a reason for the seller before rejecting their access." };
  }
  return prisma.$transaction(async (tx) => {
    // Serialize reviews with other account/preview updates before checking current access.
    await tx.$queryRaw`SELECT id FROM public."User" WHERE id = ${data.userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: data.userId },
      select: { roles: true, status: true, sellerAccess: { select: { status: true } } },
    });
    if (!user || !user.roles.includes("SELLER")) {
      return { ok: false, message: "This seller account is no longer available. Refresh the users list." };
    }
    if (data.status === "APPROVED" && user.status !== "ACTIVE") {
      return { ok: false, message: "This account is suspended. Seller approval cannot restore a suspended account." };
    }
    // Repeated approvals preserve the original reviewer and do not duplicate audit/notifications.
    if (user.sellerAccess?.status === data.status) return { ok: true, changed: false, data };
    if (data.status === "REJECTED" && user.sellerAccess?.status === "APPROVED") {
      return { ok: false, message: "Approved access can’t be rejected. Suspend the seller’s access instead." };
    }

    await tx.sellerAccess.upsert({
      where: { userId: data.userId },
      update: { reviewedAt: new Date(), reviewedByUserId: admin.id, status: data.status },
      create: { reviewedAt: new Date(), reviewedByUserId: admin.id, status: data.status, userId: data.userId },
    });
    await tx.notification.create({
      data: {
        ...reviewNotification(data.status, data.notes),
        metadata: { sellerAccessStatus: data.status },
        type: "seller_access_reviewed",
        userId: data.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "seller_access_review",
        actorUserId: admin.id,
        metadata: { notes: data.notes, previousStatus: user.sellerAccess?.status ?? null, status: data.status },
        targetId: data.userId,
        targetType: "user",
      },
    });
    return { ok: true, changed: true, data };
  });
}
