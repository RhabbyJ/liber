import "server-only";

import { prisma } from "@liber/db";
import { buyerProfileModerationSchema } from "@liber/validators";
import { withOwnerTestPreapproval } from "../../lib/test-preapproval";
import { normalizeInput } from "../normalize-input";
import { requireSessionRole } from "../session";
import { activeTestPreapprovalProfileIds } from "../test-preapproval";
import { buyerFromDb, buyerInclude } from "./buyer-projection";
import { inviteFromDb, inviteModerationMessages, labelSyntheticInvites } from "./invite-projection";

export async function listAdminBuyerProfiles() {
  await requireSessionRole("ADMIN");
  const [buyers, documents] = await Promise.all([
    prisma.buyerProfile.findMany({
      include: { ...buyerInclude, user: { select: { avatarVariant: true, name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.verificationDocument.findMany({
      where: {
        buyerProfileId: { not: null },
        reviewStatus: "APPROVED",
      },
      orderBy: { reviewedAt: "desc" },
      select: {
        documentType: true,
        fileSha256: true,
        id: true,
        buyerProfileId: true,
        originalFilename: true,
      },
    }),
  ]);
  const documentsByBuyer = new Map<string, typeof documents>();
  for (const document of documents) {
    if (!document.buyerProfileId) continue;
    documentsByBuyer.set(document.buyerProfileId, [
      ...(documentsByBuyer.get(document.buyerProfileId) ?? []),
      document,
    ]);
  }
  const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, buyers.map((buyer) => buyer.id));

  return {
    ok: true,
    data: buyers.map((buyer) => ({
      ...withOwnerTestPreapproval(buyerFromDb(buyer), testPreapprovalIds),
      accountName: buyer.user.name,
      accountEmail: buyer.user.email,
      approvedDocuments: documentsByBuyer.get(buyer.id) ?? [],
    })),
  };
}

export async function hideBuyerProfile(input: unknown) {
  const admin = await requireSessionRole("ADMIN");
  const data = buyerProfileModerationSchema.parse(normalizeInput(input));
  await prisma.$transaction([
    prisma.buyerProfile.update({
      where: { id: data.buyerProfileId },
      data: { visibilityStatus: "HIDDEN" },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "hide_buyer_profile",
        actorUserId: admin.id,
        metadata: { reason: data.reason },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    }),
  ]);
  return { ok: true, data };
}

export async function listAdminInvites() {
  await requireSessionRole("ADMIN");
  const invites = await prisma.invite.findMany({
    include: {
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { name: true } } } },
      conversation: {
        select: {
          messages: inviteModerationMessages,
        },
      },
      property: { select: { addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: await labelSyntheticInvites(invites.map(inviteFromDb), invites) };
}
