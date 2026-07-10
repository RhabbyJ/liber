import type { Prisma } from "@liber/db";

export function activePrimaryServiceAreaWhere(
  marketSlug?: string,
  serviceAreaIds?: string[],
): Prisma.BuyerProfileWhereInput {
  return {
    desiredServiceAreas: {
      some: {
        isPrimary: true,
        source: "SELECTED",
        serviceArea: {
          active: true,
          market: { active: true, ...(marketSlug ? { slug: marketSlug } : {}) },
        },
        ...(serviceAreaIds ? { serviceAreaId: { in: serviceAreaIds } } : {}),
      },
    },
  };
}
