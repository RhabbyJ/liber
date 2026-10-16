import "server-only";

import { prisma } from "@liber/db";
import { createSellerPropertySchema, updateSellerPropertySchema } from "@liber/validators";
import type { SellerPropertyDTO } from "../../lib/marketplace-dtos";
import { currentCoverImageId } from "../../lib/property-cover";
import { propertySubtypeLabel } from "../../lib/property-types";
import { normalizeInput } from "../normalize-input";
import { requireSessionRole } from "../session";
import { activeSyntheticPropertyApprovals, syntheticPropertyVersionKey, TEST_PROPERTY_LABEL } from "../synthetic-property-review";
import { auditSecurityEvent, toNumber } from "./shared";

type Property = SellerPropertyDTO;

export type OwnershipEvidenceStatus = {
  rejectionReason?: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  submittedAt: string;
};

export function propertyStatusLabel(value: string) {
  if (value === "APPROVED") return "Ownership verified";
  if (value === "PENDING") return "Ownership pending";
  if (value === "REJECTED") return "Ownership rejected";
  return "Ownership not submitted";
}

const coverImageSelect = {
  orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  select: { id: true, propertyIdentityVersion: true },
};

function propertyFromDb(property: {
  addressLine1: string | null;
  city: string | null;
  condition: string | null;
  description: string | null;
  features: string[];
  id: string;
  lotSize: number | null;
  ownershipVerificationStatus: string;
  status: Property["lifecycleStatus"];
  identityVersion: number;
  price: unknown;
  propertyType: Property["propertyType"];
  squareFeet: number | null;
  state: string | null;
  zip: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
}, syntheticApproved = false): Property {
  const location = [property.city, property.state, property.zip].filter(Boolean).join(", ");

  return {
    id: property.id,
    title: property.addressLine1 || `${property.city || "Property"} ${propertySubtypeLabel(property.propertyType).toLowerCase()}`,
    location,
    price: toNumber(property.price),
    beds: property.bedrooms ?? undefined,
    baths: property.bathrooms ?? undefined,
    area: property.squareFeet ?? undefined,
    lotSize: property.lotSize ?? undefined,
    propertyType: property.propertyType,
    condition: property.condition || "",
    features: property.features,
    description: property.description || "",
    status: syntheticApproved && property.ownershipVerificationStatus === "APPROVED" ? TEST_PROPERTY_LABEL : propertyStatusLabel(property.ownershipVerificationStatus),
    lifecycleStatus: property.status,
    identityVersion: property.identityVersion,
  };
}

export async function createSellerProperty(input: unknown) {
  const seller = await requireSessionRole("SELLER");
  const data = createSellerPropertySchema.parse(normalizeInput(input));
  const property = await prisma.sellerProperty.create({
    data: {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      bathrooms: data.bathrooms,
      bedrooms: data.bedrooms,
      city: data.city,
      condition: data.condition,
      description: data.description,
      features: data.features,
      lat: data.lat,
      lng: data.lng,
      lotSize: data.lotSize,
      ownerUserId: seller.id,
      providerPropertyId: data.providerPropertyId,
      price: data.price,
      propertyType: data.propertyType,
      squareFeet: data.squareFeet,
      state: data.state,
      zip: data.zip,
      status: "DRAFT",
      authorityAttestedAt: new Date(),
      authorityAttestedByUserId: seller.id,
      authorityAttestedIdentityVersion: 1,
      attestationVersion: "v1-property-authority-2026-07",
    },
  });
  await auditSecurityEvent(seller, "property_ownership_confirmed", "seller_property", property.id, {
    ownershipConfirmed: true,
  });
  return { ok: true, data: propertyFromDb(property) };
}

export async function updateSellerProperty(input: unknown) {
  const seller = await requireSessionRole("SELLER");
  const data = updateSellerPropertySchema.parse(normalizeInput(input));
  const property = await prisma.$transaction(async (tx) => {
    const existing = await tx.sellerProperty.findFirst({
      where: { id: data.propertyId, ownerUserId: seller.id },
      select: { id: true },
    });
    if (!existing) throw new Error("Property not found.");
    const updated = await tx.sellerProperty.update({
      where: { id: data.propertyId },
      data: {
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        bathrooms: data.bathrooms,
        bedrooms: data.bedrooms,
        city: data.city,
        condition: data.condition,
        description: data.description,
        features: data.features,
        lat: data.lat,
        lng: data.lng,
        lotSize: data.lotSize,
        providerPropertyId: data.providerPropertyId,
        price: data.price,
        propertyType: data.propertyType,
        squareFeet: data.squareFeet,
        state: data.state,
        zip: data.zip,
      },
      select: { identityVersion: true },
    });
    return tx.sellerProperty.update({
      where: { id: data.propertyId },
      data: {
        authorityAttestedAt: new Date(),
        authorityAttestedByUserId: seller.id,
        authorityAttestedIdentityVersion: updated.identityVersion,
        attestationVersion: "v1-property-authority-2026-07",
      },
    });
  });
  await auditSecurityEvent(seller, "property_authority_reattested", "seller_property", property.id, {
    identityVersion: property.identityVersion,
  });
  const syntheticApprovals = await activeSyntheticPropertyApprovals(prisma, [property]);
  return { ok: true, data: propertyFromDb(property, syntheticApprovals.has(syntheticPropertyVersionKey(property))) };
}

export async function listSellerProperties() {
  const seller = await requireSessionRole("SELLER");
  const properties = await prisma.sellerProperty.findMany({
    where: { ownerUserId: seller.id },
    include: { images: coverImageSelect },
    orderBy: { updatedAt: "desc" },
  });
  const syntheticApprovals = await activeSyntheticPropertyApprovals(prisma, properties);
  return {
    ok: true,
    data: properties.map((property) => ({
      ...propertyFromDb(property, syntheticApprovals.has(syntheticPropertyVersionKey(property))),
      coverImageId: currentCoverImageId(property),
    })),
  };
}

export async function getSellerProperty(propertyId: string) {
  const seller = await requireSessionRole("SELLER");
  const property = await prisma.sellerProperty.findFirst({
    where: { id: propertyId, ownerUserId: seller.id },
    include: {
      documents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true, ownershipEvidenceKind: true, propertyIdentityVersion: true, rejectionReason: true, reviewStatus: true },
        where: { documentType: "OWNERSHIP" },
      },
      images: coverImageSelect,
    },
  });
  if (!property) throw new Error("Property not found.");
  const syntheticApprovals = await activeSyntheticPropertyApprovals(prisma, [property]);
  return {
    ok: true,
    data: {
      ...propertyFromDb(property, syntheticApprovals.has(syntheticPropertyVersionKey(property))),
      coverImageId: currentCoverImageId(property),
      // Only the current identity's photos and evidence describe this property.
      imageIds: (property.images ?? [])
        .filter((image) => image.propertyIdentityVersion === property.identityVersion)
        .map((image) => image.id),
      ownershipEvidence: latestOwnershipEvidence(property.documents ?? [], property.identityVersion),
      // Exact edit values are available only after the owner-scoped lookup above.
      address: {
        addressLine1: property.addressLine1 ?? undefined,
        addressLine2: property.addressLine2 ?? undefined,
        city: property.city ?? undefined,
        state: property.state ?? undefined,
        zip: property.zip ?? undefined,
        lat: property.lat?.toString(),
        lng: property.lng?.toString(),
      },
    },
  };
}

function latestOwnershipEvidence(
  documents: Array<{
    createdAt: Date;
    ownershipEvidenceKind: string | null;
    propertyIdentityVersion: number | null;
    rejectionReason: string | null;
    reviewStatus: string;
  }>,
  identityVersion: number,
) {
  const evidence: Partial<Record<"GOVERNMENT_ID" | "PROPERTY_ADDRESS_PROOF", OwnershipEvidenceStatus>> = {};
  for (const document of documents) {
    const kind = document.ownershipEvidenceKind;
    if ((kind !== "GOVERNMENT_ID" && kind !== "PROPERTY_ADDRESS_PROOF") || evidence[kind]) continue;
    if (document.propertyIdentityVersion !== identityVersion) continue;
    if (document.reviewStatus !== "APPROVED" && document.reviewStatus !== "PENDING" && document.reviewStatus !== "REJECTED") continue;
    evidence[kind] = {
      ...(document.reviewStatus === "REJECTED" && document.rejectionReason ? { rejectionReason: document.rejectionReason } : {}),
      status: document.reviewStatus,
      submittedAt: document.createdAt.toISOString(),
    };
  }
  return evidence;
}
