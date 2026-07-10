import { prisma, type Prisma } from "@liber/db";
import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import type { ServiceAreaResult } from "./service-areas";
import { getSearchCoverageServiceAreaIds } from "./service-areas";
import { activePrimaryServiceAreaWhere } from "./service-area-matching";
import {
  approximatePublicPin,
  publicPreviewBuyerSelect,
  publicPreviewBuyerWhere,
  toPublicBuyerPreviewDto,
} from "./buyer-dtos";

export const PUBLIC_PREVIEW_LIMIT = 6;

/**
 * Privacy-safe public teaser of buyer demand (V1 public preview rules).
 * The database projection contains only fields needed to establish eligibility
 * and build the DTO; raw buyer coordinates and identity fields are never read.
 */
export async function getPublicBuyerPreviews(
  marketSlug: string,
  serviceArea?: ServiceAreaResult | null,
): Promise<PublicBuyerPreviewDto[]> {
  try {
    const coverageAreaIds = serviceArea
      ? await getSearchCoverageServiceAreaIds(serviceArea.id, marketSlug)
      : undefined;
    const now = new Date();
    const profiles = await prisma.buyerProfile.findMany({
      where: publicPreviewBuyerWhere(marketSlug, coverageAreaIds),
      orderBy: { lastRefreshedAt: "desc" },
      take: PUBLIC_PREVIEW_LIMIT,
      select: publicPreviewBuyerSelect(now),
    });

    return profiles.flatMap((profile, index) => {
      const dto = toPublicBuyerPreviewDto(profile, index, serviceArea?.center);
      return dto ? [dto] : [];
    });
  } catch (error) {
    // The public preview is best-effort marketing; never block the homepage on it.
    console.error("[public-preview] buyer preview query failed", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

export function serviceAreaPreviewWhere(
  serviceAreaIds: string[],
  marketSlug: string,
): Prisma.BuyerProfileWhereInput {
  return activePrimaryServiceAreaWhere(marketSlug, serviceAreaIds);
}

// Compatibility helper for database geography checks. Serialized public DTOs
// use the explicit `pin.latitude` / `pin.longitude` contract instead.
export function approximatePreviewPoint(center: { lat: number; lng: number } | null, index: number) {
  const point = approximatePublicPin(center, index);
  return point ? { lat: point.latitude, lng: point.longitude } : null;
}
