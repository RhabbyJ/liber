import { prisma } from "@liber/db";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase";

const SUSPENSION_BAN_DURATION = "876000h";

type SuspensionResult = {
  buyer_profiles_suspended: number;
  outbox_jobs_cancelled: number;
  seller_access_suspended: number;
  sessions_revoked: number;
};

export async function suspendApplicationIdentity(args: {
  actorUserId: string;
  reason: string;
  targetUserId: string;
}) {
  const authAdmin = createSupabaseAdminClient();
  if (!authAdmin) throw new Error("Supabase admin client is required for account suspension.");

  const auditId = randomUUID();
  const rows = await prisma.$queryRaw<SuspensionResult[]>`
    SELECT
      buyer_profiles_suspended,
      outbox_jobs_cancelled,
      seller_access_suspended,
      sessions_revoked
    FROM app_private.suspend_identity(
      ${args.actorUserId}::uuid,
      ${args.targetUserId}::uuid,
      ${args.reason},
      ${auditId}
    )
  `;
  const result = rows[0];
  if (!result) throw new Error("Account suspension did not return an audit result.");

  const { data, error } = await authAdmin.auth.admin.updateUserById(args.targetUserId, {
    ban_duration: SUSPENSION_BAN_DURATION,
  });
  if (error || !data.user?.banned_until || new Date(data.user.banned_until) <= new Date()) {
    await recordAuthBanOutcome(args, result, "failed", error?.message ?? "Auth ban was not confirmed.");
    throw new Error("Application access was suspended, but the Supabase Auth ban must be retried.");
  }

  await recordAuthBanOutcome(args, result, "confirmed");
  return result;
}

async function recordAuthBanOutcome(
  args: { actorUserId: string; reason: string; targetUserId: string },
  result: SuspensionResult,
  outcome: "confirmed" | "failed",
  error?: string,
) {
  await prisma.adminAuditLog.create({
    data: {
      action: outcome === "confirmed" ? "suspend_user_auth_ban_confirmed" : "suspend_user_auth_ban_failed",
      actorUserId: args.actorUserId,
      metadata: {
        authBan: outcome,
        buyerProfilesSuspended: result.buyer_profiles_suspended,
        error: error?.slice(0, 500),
        outboxJobsCancelled: result.outbox_jobs_cancelled,
        reason: args.reason,
        sellerAccessSuspended: result.seller_access_suspended,
        sessionsRevoked: result.sessions_revoked,
      },
      targetId: args.targetUserId,
      targetType: "user",
    },
  });
}
