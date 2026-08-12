import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import type { AppRole } from "./authz";
import { hasRole } from "./authz";
import { assertRateLimit } from "./rate-limit";
import { getSessionUser } from "./session";

const PREVIEW_TARGET = "ceo-preview";

export function ceoPreviewSellerSelfApprovalEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.LIBER_CEO_PREVIEW_TARGET === PREVIEW_TARGET
    && env.LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL === "true";
}

/** Same opt-in as seller self-approval; gates the whole `/preview-tools` surface. */
export function ceoPreviewToolsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return ceoPreviewSellerSelfApprovalEnabled(env);
}

/**
 * CEO-demo convenience: every active signed-in account gets ADMIN, and sellers
 * get APPROVED directory access. Suspended seller access is never auto-restored.
 */
export async function ensureCeoPreviewDemoPrivileges(userId: string) {
  if (!ceoPreviewToolsEnabled()) {
    return null;
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roles: true,
      status: true,
      sellerAccess: { select: { status: true } },
    },
  });
  if (!existing || existing.status !== "ACTIVE") return null;

  const alreadyAdmin = existing.roles.includes("ADMIN");
  const needsSellerApproval = existing.roles.includes("SELLER")
    && existing.sellerAccess?.status !== "APPROVED"
    && existing.sellerAccess?.status !== "SUSPENDED";
  if (alreadyAdmin && !needsSellerApproval) {
    return {
      adminChanged: false,
      roles: existing.roles,
      sellerAccessStatus: existing.sellerAccess?.status ?? null,
      sellerChanged: false,
    };
  }

  return prisma.$transaction(async (tx) => {
    const lockedUsers = await tx.$queryRaw<Array<{ roles: AppRole[]; status: string }>>`
      SELECT roles::text[] AS roles, status
      FROM public."User"
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;
    const user = lockedUsers[0];
    if (!user || user.status !== "ACTIVE") return null;

    let roles = user.roles;
    let adminChanged = false;
    if (!roles.includes("ADMIN")) {
      roles = [...roles, "ADMIN"];
      await tx.user.update({
        where: { id: userId },
        data: { roles },
      });
      await tx.adminAuditLog.create({
        data: {
          action: "admin_role_preview_self_grant",
          actorUserId: userId,
          metadata: {
            previousRoles: user.roles,
            roles,
            source: PREVIEW_TARGET,
            automatic: true,
          },
          targetId: userId,
          targetType: "user",
        },
      });
      adminChanged = true;
    }

    let sellerAccessStatus: string | null = null;
    let sellerChanged = false;
    if (roles.includes("SELLER")) {
      const currentAccess = await tx.sellerAccess.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (currentAccess?.status === "SUSPENDED") {
        sellerAccessStatus = currentAccess.status;
      } else if (currentAccess?.status === "APPROVED") {
        sellerAccessStatus = currentAccess.status;
      } else {
        const access = await tx.sellerAccess.upsert({
          where: { userId },
          update: {
            reviewedAt: null,
            reviewedByUserId: null,
            status: "APPROVED",
          },
          create: {
            status: "APPROVED",
            userId,
          },
          select: { status: true },
        });
        sellerAccessStatus = access.status;
        sellerChanged = true;
        await tx.adminAuditLog.create({
          data: {
            action: "seller_access_preview_self_approval",
            actorUserId: userId,
            metadata: {
              automatic: true,
              previousStatus: currentAccess?.status ?? null,
              source: PREVIEW_TARGET,
              status: access.status,
            },
            targetId: userId,
            targetType: "user",
          },
        });
      }
    }

    if (adminChanged) {
      await tx.notification.create({
        data: {
          body: "Temporary admin panel access is enabled for this private-preview account.",
          metadata: { automatic: true, roles, source: PREVIEW_TARGET },
          title: "Preview admin access enabled",
          type: "admin_access_preview_enabled",
          userId,
        },
      });
    }
    if (sellerChanged) {
      await tx.notification.create({
        data: {
          body: "Temporary seller-directory access is enabled for this private-preview account.",
          metadata: { automatic: true, sellerAccessStatus, source: PREVIEW_TARGET },
          title: "Preview seller access enabled",
          type: "seller_access_preview_enabled",
          userId,
        },
      });
    }

    return {
      adminChanged,
      roles,
      sellerAccessStatus,
      sellerChanged,
    };
  });
}

export async function approveCurrentSellerForCeoPreview() {
  if (!ceoPreviewToolsEnabled()) {
    throw new Error("Private-preview seller self-approval is not enabled.");
  }

  const currentUser = await getSessionUser();
  if (!currentUser) redirect("/login?next=%2Fpreview-tools");
  if (!hasRole(currentUser, "SELLER")) {
    throw new Error("A seller account is required.");
  }

  await assertRateLimit(`ceo-preview-seller-self-approval:${currentUser.id}`, 5, 60 * 60_000);
  const result = await ensureCeoPreviewDemoPrivileges(currentUser.id);
  if (!result) throw new Error("An active seller account is required.");
  if (result.sellerAccessStatus === "SUSPENDED") {
    throw new Error("Suspended seller access requires an admin review.");
  }
  if (!result.roles.includes("SELLER")) {
    throw new Error("A seller account is required.");
  }
  return {
    changed: result.sellerChanged,
    status: result.sellerAccessStatus ?? "APPROVED",
  };
}

export async function grantCurrentAdminForCeoPreview() {
  if (!ceoPreviewToolsEnabled()) {
    throw new Error("Private-preview admin self-grant is not enabled.");
  }

  const currentUser = await getSessionUser();
  if (!currentUser) redirect("/login?next=%2Fpreview-tools");

  await assertRateLimit(`ceo-preview-admin-self-grant:${currentUser.id}`, 5, 60 * 60_000);
  const result = await ensureCeoPreviewDemoPrivileges(currentUser.id);
  if (!result) throw new Error("An active account is required.");
  return {
    changed: result.adminChanged,
    roles: result.roles,
  };
}
