import "server-only";

import { prisma } from "@liber/db";
import { grantBadgeSchema, revokeBadgeSchema } from "@liber/validators";
import type { OwnerBadgeDTO } from "../../lib/buyer-dtos";
import { normalizeInput } from "../normalize-input";
import { assertRateLimit } from "../rate-limit";
import { requireSessionRole } from "../session";
import { evidenceSupportsBadge } from "../verification/evidence-rules";
import { badgeFromDb, badgeLabel } from "./buyer-projection";

const evidenceRequiredBadgeTypes = new Set<OwnerBadgeDTO["type"]>(["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"]);

export async function grantBadge(input: unknown) {
  const admin = await requireSessionRole("ADMIN");
  await assertRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
  const data = grantBadgeSchema.parse(normalizeInput(input));
  const badge = await prisma.$transaction(async (tx) => {
    const buyerProfile = await tx.buyerProfile.findUnique({
      where: { id: data.buyerProfileId },
      select: { userId: true },
    });
    if (!buyerProfile) throw new Error("Buyer profile not found.");

    let evidenceDocument:
      | {
          documentType: string;
          fileSha256: string | null;
          id: string;
          storagePath: string;
        }
      | null = null;

    if (data.evidenceDocumentId) {
      evidenceDocument = await tx.verificationDocument.findFirst({
        where: {
          buyerProfileId: data.buyerProfileId,
          id: data.evidenceDocumentId,
          reviewStatus: "APPROVED",
        },
        select: {
          documentType: true,
          fileSha256: true,
          id: true,
          storagePath: true,
        },
      });
      if (!evidenceDocument) throw new Error("Badge evidence must be an approved document for this buyer.");
      if (!evidenceSupportsBadge(data.badgeType, evidenceDocument.documentType)) {
        throw new Error("Approved evidence is not compatible with this badge.");
      }
    }

    if (evidenceRequiredBadgeTypes.has(data.badgeType) && !evidenceDocument) {
      throw new Error("This badge requires approved document evidence.");
    }

    const badgeData = {
      evidenceDocumentId: evidenceDocument?.id,
      expiresAt:
        data.expiresAt ??
        (data.badgeType === "PRE_APPROVED"
          ? new Date(Date.now() + 90 * 86_400_000)
          : null),
      grantedAt: new Date(),
      grantedByUserId: admin.id,
      issuedAt: new Date(),
      notes: data.notes,
      source: evidenceDocument ? "ADMIN_REVIEWED_DOCUMENT" : "ADMIN_MANUAL",
      status: "ACTIVE" as const,
    };
    const created = await tx.buyerBadge.upsert({
      where: {
        buyerProfileId_badgeType: {
          badgeType: data.badgeType,
          buyerProfileId: data.buyerProfileId,
        },
      },
      update: badgeData,
      create: {
        ...badgeData,
        badgeType: data.badgeType,
        buyerProfileId: data.buyerProfileId,
      },
    });
    await tx.notification.create({
      data: {
        body: "Sellers now see this badge on your buyer profile. Your documents stay private.",
        metadata: { badgeId: created.id, badgeType: data.badgeType },
        title: `Badge added: ${badgeLabel(data.badgeType)}`,
        type: "badge_granted",
        userId: buyerProfile.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "grant_badge",
        actorUserId: admin.id,
        metadata: {
          badgeType: data.badgeType,
          evidenceDocumentId: evidenceDocument?.id,
          evidenceDocumentType: evidenceDocument?.documentType,
          evidenceFileSha256: evidenceDocument?.fileSha256,
        },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
    return created;
  });
  return { ok: true, data: badgeFromDb(badge) };
}

export async function revokeBadge(input: unknown) {
  const admin = await requireSessionRole("ADMIN");
  const data = revokeBadgeSchema.parse(normalizeInput(input));
  await prisma.$transaction(async (tx) => {
    const badge = await tx.buyerBadge.update({
      where: { id: data.badgeId },
      data: { notes: data.notes, status: "REVOKED" },
      include: { buyerProfile: { select: { userId: true } } },
    });
    await tx.notification.create({
      data: {
        body: "An admin removed this trust badge from your buyer profile.",
        metadata: { badgeId: badge.id, badgeType: badge.badgeType },
        title: `${badgeLabel(badge.badgeType)} badge revoked`,
        type: "badge_revoked",
        userId: badge.buyerProfile.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "revoke_badge",
        actorUserId: admin.id,
        metadata: { notes: data.notes },
        targetId: data.badgeId,
        targetType: "badge",
      },
    });
  });
  return { ok: true, data };
}
