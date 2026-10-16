import "server-only";

import { prisma } from "@liber/db";
import { normalizeAvatarVariant } from "../../lib/avatar-variant";
import { withOwnerTestPreapproval } from "../../lib/test-preapproval";
import { requireSessionRole } from "../session";
import { activeTestPreapprovalProfileIds } from "../test-preapproval";
import {
  buyerFromDb,
  buyerInclude,
  emptyBuyerForUser,
  privateAccountName,
  withPrivateAccountName,
} from "./buyer-projection";

export async function getCurrentBuyerProfile() {
  const user = await requireSessionRole("BUYER");
  const [profile, account] = await Promise.all([
    prisma.buyerProfile.findUnique({
      where: { userId: user.id },
      include: buyerInclude,
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarVariant: true, name: true },
    }),
  ]);
  const accountName = privateAccountName(account);
  const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, profile ? [profile.id] : []);
  return {
    ok: true,
    data: withPrivateAccountName(
      profile ? withOwnerTestPreapproval(buyerFromDb(profile), testPreapprovalIds) : emptyBuyerForUser(user, account?.avatarVariant),
      accountName,
    ),
  };
}

export async function setBuyerAvatarVariant(avatarVariant: string) {
  const user = await requireSessionRole("BUYER");
  const normalized = normalizeAvatarVariant(avatarVariant);
  if (!normalized) throw new Error("Choose one of the available avatars.");
  return persistBuyerAvatarVariant(user.id, normalized);
}

async function persistBuyerAvatarVariant(userId: string, avatarVariant: string) {
  const [updatedUser, profile] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { avatarVariant },
      select: { avatarVariant: true },
    }),
    prisma.buyerProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  return {
    ok: true as const,
    data: { avatarVariant: updatedUser.avatarVariant, buyerProfileId: profile?.id ?? null },
  };
}
