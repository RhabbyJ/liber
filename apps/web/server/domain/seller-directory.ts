import "server-only";

import { Prisma, prisma } from "@liber/db";
import { searchBuyersSchema, type SearchBuyersInput } from "@liber/validators";
import { withSellerTestPreapproval } from "../../lib/test-preapproval";
import {
  canViewBuyerDirectory,
  canViewBuyerProfile,
  requireApprovedSellerAccess,
  sellerAccessStatusForUser,
} from "../access";
import { sellerBuyerDetail, sellerBuyerSelect, sellerBuyerSummary, type SellerBuyerRow } from "../buyer/read-models";
import { usersHaveMessagingBlock } from "../messaging/service";
import { assertRateLimit } from "../rate-limit";
import { querySellerSearchIds } from "../seller-search-query";
import { activePrimaryServiceAreaWhere } from "../service-area-matching";
import { requireSessionRole } from "../session";
import { syntheticJourneyBuyerProfileIds } from "../synthetic-property-review";
import { activeTestPreapprovalProfileIds } from "../test-preapproval";
import { auditSecurityEvent, requireAuthenticatedUser } from "./shared";

async function searchDbBuyerProfiles(filters: SearchBuyersInput, viewerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const page = await querySellerSearchIds(tx, filters, now, Prisma.raw("public"), viewerUserId);
    const profiles = page.ids.length > 0
      ? await tx.buyerProfile.findMany({
          where: { id: { in: page.ids } },
          select: sellerBuyerSelect(now),
        })
      : [];
    const profilesById = new Map(
      profiles.map((profile: SellerBuyerRow) => [profile.id, profile] as const),
    );
    if (profilesById.size !== page.ids.length) {
      throw new Error("Seller search result changed during pagination.");
    }
    const demoAuditRows = page.ids.length > 0
      ? await tx.adminAuditLog.findMany({
          where: { action: "seed_demo_buyer", targetId: { in: page.ids }, targetType: "buyer_profile" },
          select: { targetId: true },
        })
      : [];
    const demoProfileIds = new Set(demoAuditRows.map((row) => row.targetId));
    for (const id of await syntheticJourneyBuyerProfileIds(tx, page.ids)) demoProfileIds.add(id);
    const testPreapprovalIds = await activeTestPreapprovalProfileIds(tx, page.ids, now);

    return {
      items: page.ids.map((id) => withSellerTestPreapproval(sellerBuyerSummary(profilesById.get(id)!, viewerUserId, demoProfileIds.has(id)), testPreapprovalIds)),
      pageInfo: {
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        pageSize: page.pageSize,
        snapshotAt: page.snapshotAt,
      },
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function searchBuyers(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertRateLimit(`buyer-search:${seller.id}`, 60, 60_000);
  const data = searchBuyersSchema.parse(input);
  const results = await searchDbBuyerProfiles(data, seller.id);
  await auditSecurityEvent(seller, "buyer_search", "buyer_directory", "search", {
    resultCount: results.items.length,
    ...(data.serviceArea ? { serviceArea: data.serviceArea } : {}),
  });
  return { ok: true, data: results };
}

export async function getBuyerProfileForSeller(buyerProfileId: string) {
  const seller = await requireApprovedSellerAccess();
  await assertRateLimit(`buyer-profile-view:${seller.id}`, 120, 60 * 60_000);
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, visibilityStatus: "ACTIVE", user: { status: "ACTIVE" }, ...activePrimaryServiceAreaWhere() },
    select: sellerBuyerSelect(),
  });
  if (!buyer) throw new Error("Buyer profile not found.");
  if (await usersHaveMessagingBlock(prisma, seller.id, buyer.userId)) {
    throw new Error("Buyer profile not found.");
  }
  const isDemo = await isControlledDemoBuyerProfile(buyer.id);
  const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, [buyer.id]);
  await auditSecurityEvent(seller, "buyer_profile_view", "buyer_profile", buyer.id);
  return { ok: true, data: withSellerTestPreapproval(sellerBuyerDetail(buyer, seller.id, isDemo), testPreapprovalIds) };
}

export async function getAuthorizedBuyerProfile(buyerProfileId: string) {
  const user = await requireAuthenticatedUser();
  await assertRateLimit(`buyer-profile-view:${user.id}`, 120, 60 * 60_000);
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, visibilityStatus: "ACTIVE", user: { status: "ACTIVE" }, ...activePrimaryServiceAreaWhere() },
    select: sellerBuyerSelect(),
  });

  if (buyer) {
    if (await usersHaveMessagingBlock(prisma, user.id, buyer.userId)) {
      await auditSecurityEvent(user, "blocked_buyer_profile_view", "buyer_profile", buyer.id);
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    if (!(await canViewBuyerProfile(user, buyer.userId))) {
      await auditSecurityEvent(user, "blocked_buyer_profile_view", "buyer_profile", buyer.id);
      return { ok: false as const, error: "UNAUTHORIZED" as const };
    }

    await auditSecurityEvent(user, "buyer_profile_view", "buyer_profile", buyer.id);
    const isDemo = await isControlledDemoBuyerProfile(buyer.id);
    const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, [buyer.id]);
    return {
      ok: true,
      data: {
        ...withSellerTestPreapproval(sellerBuyerDetail(buyer, user.id, isDemo), testPreapprovalIds),
        viewerCanInvite: user.id !== buyer.userId && (await canViewBuyerDirectory(user)),
        viewerIsOwner: user.id === buyer.userId,
      },
    };
  }
  return { ok: false as const, error: "NOT_FOUND" as const };
}

async function isControlledDemoBuyerProfile(buyerProfileId: string) {
  return await prisma.adminAuditLog.count({
    where: { action: "seed_demo_buyer", targetId: buyerProfileId, targetType: "buyer_profile" },
  }) > 0 || (await syntheticJourneyBuyerProfileIds(prisma, [buyerProfileId])).has(buyerProfileId);
}

export async function getCurrentSellerAccess() {
  const seller = await requireSessionRole("SELLER");
  return {
    ok: true,
    data: {
      status: await sellerAccessStatusForUser(seller.id),
    },
  };
}
