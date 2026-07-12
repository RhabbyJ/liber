import { Prisma, prisma } from "@liber/db";
import { updateBuyerProfileSchema, upsertBuyerCriteriaSchema } from "@liber/validators";
import { redirect } from "next/navigation";
import { buyerAliasFromSeed, normalizeBuyerAlias } from "../../lib/buyer-alias";
import { propertySubtypeFromSeekingPropertyType } from "../../lib/property-types";
import { defaultPathForSessionUser } from "../auth-intent";
import { hasRole } from "../authz";
import { normalizeInput } from "../normalize-input";
import { getSessionUser } from "../session";

type SaveMode = "DRAFT" | "PUBLISH";

const canonicalAreaSelect = {
  centerLat: true,
  centerLng: true,
  city: true,
  id: true,
  label: true,
  market: { select: { slug: true } },
  postalCode: true,
  slug: true,
  state: true,
  type: true,
} as const;

type CanonicalArea = Prisma.ServiceAreaGetPayload<{ select: typeof canonicalAreaSelect }>;

export async function saveBuyerProfile(input: unknown, mode: SaveMode = "PUBLISH") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRole(user, "BUYER")) redirect(defaultPathForSessionUser(user));

  const normalized = normalizeInput(input) as Record<string, unknown>;
  const profile = updateBuyerProfileSchema.parse(normalized);
  const criteria = upsertBuyerCriteriaSchema.parse({
    ...normalized,
    buyerProfileId: "server-owned",
    propertySubtype: propertySubtypeFromSeekingPropertyType(normalized.buyingPurpose),
    priceMin: normalized.budgetMin,
    priceMax: normalized.budgetMax,
  });

  if (mode === "PUBLISH") validatePublication(profile, criteria);

  const result = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.buyerProfile.findUnique({
      where: { userId: user.id },
      select: { displayName: true, id: true, visibilityStatus: true },
    });
    if (existing) {
      await tx.$queryRaw`SELECT id FROM public."BuyerProfile" WHERE id = ${existing.id} FOR UPDATE`;
    }
    if (existing?.visibilityStatus === "HIDDEN" || existing?.visibilityStatus === "SUSPENDED") {
      throw new Error("This profile is controlled by admin review and cannot be published.");
    }

    const selectedArea = await resolveArea(tx, profile.desiredMarketSlug, profile.desiredServiceAreaSlug);
    if (mode === "PUBLISH" && !selectedArea) {
      throw new Error("Choose an active Liber service area before publishing your profile.");
    }
    const displayName = normalizeBuyerAlias(existing?.displayName) ?? buyerAliasFromSeed(user.id);
    const saved = await tx.buyerProfile.upsert({
      where: { userId: user.id },
      update: {
        bio: profile.bio,
        budgetMax: profile.budgetMax,
        budgetMin: profile.budgetMin,
        buyerType: profile.buyerType,
        buyingPurpose: profile.buyingPurpose,
        displayName,
        downPaymentMax: profile.downPaymentMax,
        downPaymentMin: profile.downPaymentMin,
        lastRefreshedAt: new Date(),
        visibilityStatus: "DRAFT",
        ...locationData(selectedArea),
      },
      create: {
        bio: profile.bio,
        budgetMax: profile.budgetMax,
        budgetMin: profile.budgetMin,
        buyerType: profile.buyerType,
        buyingPurpose: profile.buyingPurpose,
        displayName,
        downPaymentMax: profile.downPaymentMax,
        downPaymentMin: profile.downPaymentMin,
        lastRefreshedAt: new Date(),
        userId: user.id,
        visibilityStatus: "DRAFT",
        ...locationData(selectedArea),
      },
      select: { id: true },
    });

    await tx.buyerDesiredServiceArea.deleteMany({ where: { buyerProfileId: saved.id } });
    if (selectedArea) {
      await tx.buyerDesiredServiceArea.create({
        data: {
          buyerProfileId: saved.id,
          isPrimary: true,
          serviceAreaId: selectedArea.id,
          source: "SELECTED",
        },
      });
      await tx.serviceAreaMigrationQuarantine.updateMany({
        where: { buyerProfileId: saved.id, resolvedAt: null },
        data: {
          resolution: {
            actorUserId: user.id,
            serviceAreaId: selectedArea.id,
            source: "BUYER_CONFIRMED",
          },
          resolvedAt: new Date(),
        },
      });
    }

    await tx.buyerCriteria.upsert({
      where: { buyerProfileId: saved.id },
      update: criteriaData(criteria),
      create: { ...criteriaData(criteria), buyerProfileId: saved.id },
    });

    await tx.adminAuditLog.create({
      data: {
        action: mode === "PUBLISH" ? "publish_buyer_profile" : "save_buyer_profile_draft",
        actorUserId: user.id,
        metadata: { serviceAreaSlug: selectedArea?.slug ?? null },
        targetId: saved.id,
        targetType: "buyer_profile",
      },
    });

    if (mode === "PUBLISH") {
      await tx.buyerProfile.update({
        where: { id: saved.id },
        data: { visibilityStatus: "ACTIVE" },
      });
    }
    return saved;
  }, { isolationLevel: "Serializable" }));

  return { ok: true, data: result };
}

async function resolveArea(
  tx: Prisma.TransactionClient,
  marketSlug: string | undefined,
  serviceAreaSlug: string | null | undefined,
): Promise<CanonicalArea | null> {
  if (!serviceAreaSlug) return null;
  if (!marketSlug) throw new Error("A market is required for the selected service area.");
  const area = await tx.serviceArea.findFirst({
    where: {
      active: true,
      slug: serviceAreaSlug,
      market: { active: true, slug: marketSlug },
    },
    select: canonicalAreaSelect,
  });
  if (!area) throw new Error("Unsupported service area for this market.");
  return area;
}

function locationData(area: CanonicalArea | null) {
  if (!area) {
    return {
      desiredCity: null,
      desiredLat: null,
      desiredLng: null,
      desiredLocationText: null,
      desiredNeighborhood: null,
      desiredPostalCode: null,
      desiredState: null,
    };
  }
  const city = area.type === "neighborhood" ? area.label : area.city ?? area.label;
  return {
    desiredCity: city,
    desiredLat: area.centerLat,
    desiredLng: area.centerLng,
    desiredLocationText: area.type === "zip" && area.postalCode
      ? `${city}, ${area.state} ${area.postalCode}`
      : `${area.label}, ${area.state}`,
    desiredNeighborhood: area.type === "neighborhood" ? area.label : null,
    desiredPostalCode: area.postalCode,
    desiredState: area.state,
  };
}

function criteriaData(criteria: ReturnType<typeof upsertBuyerCriteriaSchema.parse>) {
  return {
    bathroomsMin: criteria.bathroomsMin,
    bedroomsMin: criteria.bedroomsMin,
    condition: criteria.condition,
    features: criteria.features,
    lotSizeMax: criteria.lotSizeMax,
    lotSizeMin: criteria.lotSizeMin,
    priceMax: criteria.priceMax,
    priceMin: criteria.priceMin,
    propertyCategory: "HOME" as const,
    propertySubtype: criteria.propertySubtype,
    squareFeetMax: criteria.squareFeetMax,
    squareFeetMin: criteria.squareFeetMin,
    yearBuiltMin: criteria.yearBuiltMin,
  };
}

function validatePublication(
  profile: ReturnType<typeof updateBuyerProfileSchema.parse>,
  criteria: ReturnType<typeof upsertBuyerCriteriaSchema.parse>,
) {
  if (!profile.buyerType || !profile.buyingPurpose) {
    throw new Error("Purchase type and seeking property type are required before publishing.");
  }
  if (profile.budgetMin === undefined || profile.budgetMax === undefined) {
    throw new Error("Budget range is required before publishing.");
  }
  if (!profile.desiredServiceAreaSlug || !profile.desiredMarketSlug) {
    throw new Error("Choose an active Liber service area before publishing your profile.");
  }
  if (!criteria.propertySubtype) throw new Error("Buyer criteria are required before publishing.");
}

async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 3) {
        throw error;
      }
    }
  }
  throw new Error("Buyer profile save could not be serialized.");
}
