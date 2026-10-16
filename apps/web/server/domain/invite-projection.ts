import "server-only";

import { prisma } from "@liber/db";
import type { InviteDTO, SellerPropertyDTO } from "../../lib/marketplace-dtos";
import { propertySubtypeLabel } from "../../lib/property-types";
import { visibleMessageBody } from "../messaging/content";
import { messagingV1EnabledForPair } from "../messaging/feature";
import { publicNameForDisplay } from "../public-identity";
import { activeSyntheticPropertyApprovals, syntheticPropertyVersionKey, TEST_PROPERTY_LABEL } from "../synthetic-property-review";
import { propertyStatusLabel } from "./seller-properties";
import { dateKey } from "./shared";

type Invite = InviteDTO;
type Property = SellerPropertyDTO;

// Every invite list reads the canonical invite message's moderation state so redactions apply everywhere.
export const inviteModerationMessages = {
  where: { kind: "INVITE" as const },
  select: { moderationStatus: true },
  take: 1,
};

function titleFromStatus(value: string): Invite["status"] {
  if (value === "VIEWED") return "Viewed";
  if (value === "ACCEPTED") return "Accepted";
  if (value === "DECLINED") return "Declined";
  if (value === "EXPIRED" || value === "WITHDRAWN") return "Expired";
  return "Sent";
}

function inviteListingFacts(property: { bathrooms?: number | null; bedrooms?: number | null; description?: string | null; price?: unknown; squareFeet?: number | null }) {
  const price = property.price === null || property.price === undefined ? undefined : Number(property.price);
  return {
    ...(price && Number.isFinite(price) && price > 0 ? { propertyPrice: price } : {}),
    ...(property.bedrooms ? { propertyBedrooms: property.bedrooms } : {}),
    ...(property.bathrooms ? { propertyBathrooms: property.bathrooms } : {}),
    ...(property.squareFeet ? { propertySquareFeet: property.squareFeet } : {}),
    ...(property.description?.trim() ? { propertyNote: property.description.trim() } : {}),
  };
}

export function inviteFromDb(invite: {
  buyerProfile: { displayName: string; userId: string; user?: { name?: string | null } };
  buyerProfileId: string;
  conversation?: {
    id?: string;
    messages?: Array<{ moderationStatus: "ALLOWED" | "FLAGGED" | "REDACTED" }>;
  } | null;
  id: string;
  message: string;
  property: {
    addressLine1: string | null;
    city: string | null;
    identityVersion: number;
    ownershipVerificationStatus: string;
    propertyType: Property["propertyType"];
    images?: Array<{ id: string; propertyIdentityVersion: number }>;
    condition?: string | null;
    features?: string[];
    price?: unknown;
    bedrooms?: number | null;
    bathrooms?: number | null;
    squareFeet?: number | null;
    description?: string | null;
  };
  propertyId: string;
  propertyIdentityVersion: number;
  sellerId: string;
  sentAt: Date;
  expiresAt: Date | null;
  status: string;
  title: string;
}): Invite {
  const currentIdentity = invite.propertyIdentityVersion === invite.property.identityVersion;
  const displayMessage = visibleMessageBody(
    invite.message,
    invite.conversation?.messages?.some((message) => message.moderationStatus === "REDACTED")
      ? "REDACTED"
      : "ALLOWED",
  );
  const conversationAvailable = Boolean(
    invite.conversation?.id
    && messagingV1EnabledForPair(invite.sellerId, invite.buyerProfile.userId),
  );
  return {
    id: invite.id,
    buyerProfileId: invite.buyerProfileId,
    propertyId: invite.propertyId,
    propertyType: invite.property.propertyType,
    buyer: publicNameForDisplay(invite.buyerProfile.user?.name, invite.buyerProfile.userId),
    property: invite.property.addressLine1 || `${invite.property.city || "Property"} ${propertySubtypeLabel(invite.property.propertyType).toLowerCase()}`,
    propertyStatus: propertyStatusLabel(invite.property.ownershipVerificationStatus),
    propertyCondition: currentIdentity ? invite.property.condition ?? undefined : undefined,
    propertyFeatures: currentIdentity ? invite.property.features ?? [] : [],
    ...(currentIdentity ? inviteListingFacts(invite.property) : {}),
    status: !currentIdentity || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now() && ["SENT", "VIEWED"].includes(invite.status))
      ? "Expired"
      : titleFromStatus(invite.status),
    sentAt: invite.sentAt.toISOString(),
    sentAtDate: dateKey(invite.sentAt),
    expiresAt: invite.expiresAt?.toISOString(),
    title: invite.title,
    message: displayMessage,
    imageIds: currentIdentity
      ? invite.property.images
        ?.filter((image) => image.propertyIdentityVersion === invite.property.identityVersion)
        .map((image) => image.id) ?? []
      : [],
    conversationAvailable,
    conversationId: conversationAvailable ? invite.conversation?.id : undefined,
  };
}

export async function labelSyntheticInvites(dtos: Invite[], invites: Array<{ propertyId: string; propertyIdentityVersion: number }>) {
  const versions = invites.map((invite) => ({ id: invite.propertyId, identityVersion: invite.propertyIdentityVersion }));
  const approvals = await activeSyntheticPropertyApprovals(prisma, versions);
  return dtos.map((dto, index) => approvals.has(syntheticPropertyVersionKey(versions[index]))
    ? { ...dto, propertyStatus: TEST_PROPERTY_LABEL } : dto);
}
