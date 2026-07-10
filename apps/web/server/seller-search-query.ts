import { Prisma } from "@liber/db";
import type { SearchBuyersInput } from "@liber/validators";
import { createHash } from "node:crypto";

export const DEFAULT_SELLER_SEARCH_PAGE_SIZE = 24;
export const MAX_SELLER_SEARCH_PAGE_SIZE = 100;
export const SELLER_SEARCH_CURSOR_MAX_AGE_MS = 30 * 60 * 1000;
const SELLER_SEARCH_CURSOR_CLOCK_SKEW_MS = 60 * 1000;

export class SellerSearchCursorError extends Error {
  constructor(message = "Invalid seller search cursor.") {
    super(message);
    this.name = "SellerSearchCursorError";
  }
}

type SellerSearchCursor = {
  filterHash: string;
  id: string;
  key: string;
  snapshotAt: string;
  sort: SearchBuyersInput["sort"];
  version: 1;
};

type SellerSearchRow = {
  id: string;
  sortKey: string;
};

type SellerSearchQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export type SellerSearchIdPage = {
  hasMore: boolean;
  ids: string[];
  nextCursor: string | null;
  pageSize: number;
  snapshotAt: string;
};

export async function querySellerSearchIds(
  client: SellerSearchQueryClient,
  filters: SearchBuyersInput,
  now = new Date(),
  schema = Prisma.raw("public"),
): Promise<SellerSearchIdPage> {
  const cursor = filters.cursor ? decodeSellerSearchCursor(filters.cursor) : null;
  const filterHash = sellerSearchFilterHash(filters);
  if (cursor && (cursor.sort !== filters.sort || cursor.filterHash !== filterHash)) {
    throw new SellerSearchCursorError("Search cursor does not match the current filters.");
  }

  const snapshotAt = cursor ? new Date(cursor.snapshotAt) : now;
  if (
    cursor &&
    (snapshotAt.getTime() < now.getTime() - SELLER_SEARCH_CURSOR_MAX_AGE_MS ||
      snapshotAt.getTime() > now.getTime() + SELLER_SEARCH_CURSOR_CLOCK_SKEW_MS)
  ) {
    throw new SellerSearchCursorError("Seller search cursor has expired.");
  }
  const rows = await client.$queryRaw<SellerSearchRow[]>(
    buildSellerSearchQuery(filters, snapshotAt, cursor, schema),
  );
  const hasMore = rows.length > filters.pageSize;
  const pageRows = hasMore ? rows.slice(0, filters.pageSize) : rows;
  const lastRow = pageRows.at(-1);

  return {
    hasMore,
    ids: pageRows.map((row) => row.id),
    nextCursor: hasMore && lastRow
      ? encodeSellerSearchCursor({
          id: lastRow.id,
          filterHash,
          key: String(lastRow.sortKey),
          snapshotAt: snapshotAt.toISOString(),
          sort: filters.sort,
          version: 1,
        })
      : null,
    pageSize: filters.pageSize,
    snapshotAt: snapshotAt.toISOString(),
  };
}

export function buildSellerSearchQuery(
  filters: SearchBuyersInput,
  snapshotAt: Date,
  cursor: SellerSearchCursor | null = null,
  schema = Prisma.raw("public"),
) {
  const criteriaPredicates: Prisma.Sql[] = [];
  if (filters.propertyCategory) {
    criteriaPredicates.push(Prisma.sql`criteria."propertyCategory"::text = ${filters.propertyCategory}`);
  }
  if (filters.propertySubtype) {
    criteriaPredicates.push(Prisma.sql`criteria."propertySubtype"::text = ${filters.propertySubtype}`);
  }
  if (filters.bedrooms !== undefined) {
    criteriaPredicates.push(Prisma.sql`(criteria."bedroomsMin" IS NULL OR criteria."bedroomsMin" <= ${filters.bedrooms})`);
  }
  if (filters.bathrooms !== undefined) {
    criteriaPredicates.push(Prisma.sql`(criteria."bathroomsMin" IS NULL OR criteria."bathroomsMin" <= ${filters.bathrooms})`);
  }
  if (filters.squareFeet !== undefined) {
    criteriaPredicates.push(
      Prisma.sql`(criteria."squareFeetMin" IS NULL OR criteria."squareFeetMin" <= ${filters.squareFeet})`,
      Prisma.sql`(criteria."squareFeetMax" IS NULL OR criteria."squareFeetMax" >= ${filters.squareFeet})`,
    );
  }
  if (filters.lotSize !== undefined) {
    criteriaPredicates.push(
      Prisma.sql`(criteria."lotSizeMin" IS NULL OR criteria."lotSizeMin" <= ${filters.lotSize})`,
      Prisma.sql`(criteria."lotSizeMax" IS NULL OR criteria."lotSizeMax" >= ${filters.lotSize})`,
    );
  }

  const predicates: Prisma.Sql[] = [
    Prisma.sql`buyer."visibilityStatus"::text = 'ACTIVE'`,
    Prisma.sql`account.status::text = 'ACTIVE'`,
    Prisma.sql`buyer."createdAt" <= ${snapshotAt}`,
    Prisma.sql`buyer."updatedAt" <= ${snapshotAt}`,
  ];
  if (filters.serviceArea) {
    predicates.push(Prisma.sql`buyer_area.id IN (SELECT id FROM coverage)`);
  }
  if (filters.budgetMin !== undefined) {
    predicates.push(Prisma.sql`buyer."budgetMax" >= ${filters.budgetMin}`);
  }
  if (filters.budgetMax !== undefined) {
    predicates.push(Prisma.sql`(buyer."budgetMin" IS NULL OR buyer."budgetMin" <= ${filters.budgetMax})`);
  }
  if (criteriaPredicates.length > 0) {
    predicates.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM ${schema}."BuyerCriteria" criteria
        WHERE criteria."buyerProfileId" = buyer.id
          AND ${Prisma.join(criteriaPredicates, " AND ")}
      )
    `);
  }
  if (filters.condition) {
    predicates.push(Prisma.sql`
      (
        NOT EXISTS (
          SELECT 1 FROM ${schema}."BuyerCriteria" condition_criteria
          WHERE condition_criteria."buyerProfileId" = buyer.id
        )
        OR EXISTS (
          SELECT 1
          FROM ${schema}."BuyerCriteria" condition_criteria
          WHERE condition_criteria."buyerProfileId" = buyer.id
            AND (
              NULLIF(BTRIM(condition_criteria.condition), '') IS NULL
              OR BTRIM(condition_criteria.condition) = ${filters.condition}
            )
        )
      )
    `);
  }
  for (const amenity of filters.amenities) {
    predicates.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM ${schema}."BuyerCriteria" amenity_criteria
        WHERE amenity_criteria."buyerProfileId" = buyer.id
          AND amenity_criteria.features @> ARRAY[${amenity}]::text[]
      )
    `);
  }
  for (const badge of filters.badges) {
    predicates.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM ${schema}."BuyerBadge" required_badge
        WHERE required_badge."buyerProfileId" = buyer.id
          AND required_badge."badgeType"::text = ${badge}
          AND required_badge.status::text = 'ACTIVE'
          AND required_badge."createdAt" <= ${snapshotAt}
          AND required_badge."updatedAt" <= ${snapshotAt}
          AND (required_badge."expiresAt" IS NULL OR required_badge."expiresAt" > ${snapshotAt})
      )
    `);
  }

  const sortExpression = sellerSearchSortExpression(filters.sort);
  const cursorPredicate = cursor
    ? sellerSearchCursorPredicate(filters.sort, cursor)
    : Prisma.sql`TRUE`;

  return Prisma.sql`
    WITH RECURSIVE coverage(id) AS (
      SELECT selected_area.id
      FROM ${schema}.service_areas selected_area
      JOIN ${schema}.markets selected_market ON selected_market.id = selected_area.market_id
      WHERE selected_area.slug = ${filters.serviceArea ?? ""}
        AND selected_area.active = true
        AND selected_market.active = true
        AND selected_market.slug = ${filters.market}

      UNION

      SELECT relationship.child_service_area_id
      FROM ${schema}.service_area_relationships relationship
      JOIN coverage parent ON parent.id = relationship.parent_service_area_id
      JOIN ${schema}.service_areas child ON child.id = relationship.child_service_area_id
      JOIN ${schema}.markets child_market ON child_market.id = child.market_id
      WHERE relationship.relation_type::text = 'SEARCH_ROLLUP'
        AND relationship.reviewed_at IS NOT NULL
        AND child.active = true
        AND child_market.active = true
        AND child_market.slug = ${filters.market}
    ),
    ranked AS (
      SELECT buyer.id, ${sortExpression} AS sort_key
      FROM ${schema}."BuyerProfile" buyer
      JOIN ${schema}."User" account ON account.id = buyer."userId"
      JOIN ${schema}.buyer_desired_service_areas buyer_selection
        ON buyer_selection.buyer_profile_id = buyer.id
       AND buyer_selection.is_primary = true
       AND buyer_selection.source::text = 'SELECTED'
      JOIN ${schema}.service_areas buyer_area
        ON buyer_area.id = buyer_selection.service_area_id
       AND buyer_area.active = true
      JOIN ${schema}.markets buyer_market
        ON buyer_market.id = buyer_area.market_id
       AND buyer_market.active = true
       AND buyer_market.slug = ${filters.market}
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS active_badge_count
        FROM ${schema}."BuyerBadge" badge
        WHERE badge."buyerProfileId" = buyer.id
          AND badge.status::text = 'ACTIVE'
          AND badge."createdAt" <= ${snapshotAt}
          AND badge."updatedAt" <= ${snapshotAt}
          AND (badge."expiresAt" IS NULL OR badge."expiresAt" > ${snapshotAt})
      ) active_badges ON TRUE
      WHERE ${Prisma.join(predicates, " AND ")}
    )
    SELECT id, sort_key::text AS "sortKey"
    FROM ranked
    WHERE ${cursorPredicate}
    ORDER BY sort_key DESC, id ASC
    LIMIT ${filters.pageSize + 1}
  `;
}

export function encodeSellerSearchCursor(cursor: SellerSearchCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSellerSearchCursor(value: string): SellerSearchCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object") throw new Error("invalid shape");
    const cursor = decoded as Partial<SellerSearchCursor>;
    if (
      cursor.version !== 1 ||
      typeof cursor.filterHash !== "string" ||
      !/^[a-f0-9]{24}$/.test(cursor.filterHash) ||
      typeof cursor.id !== "string" ||
      cursor.id.length < 1 ||
      cursor.id.length > 200 ||
      typeof cursor.key !== "string" ||
      cursor.key.length < 1 ||
      cursor.key.length > 100 ||
      typeof cursor.snapshotAt !== "string" ||
      !Number.isFinite(new Date(cursor.snapshotAt).getTime()) ||
      !isSellerSearchSort(cursor.sort)
    ) {
      throw new Error("invalid fields");
    }
    if (cursor.sort !== "recently_active" && !Number.isFinite(Number(cursor.key))) {
      throw new Error("invalid numeric key");
    }
    if (cursor.sort === "recently_active" && !Number.isFinite(new Date(cursor.key).getTime())) {
      throw new Error("invalid date key");
    }
    return cursor as SellerSearchCursor;
  } catch {
    throw new SellerSearchCursorError();
  }
}

export function sellerSearchFilterHash(filters: SearchBuyersInput) {
  const stableFilters = {
    amenities: [...filters.amenities].sort(),
    badges: [...filters.badges].sort(),
    bathrooms: filters.bathrooms,
    bedrooms: filters.bedrooms,
    budgetMax: filters.budgetMax,
    budgetMin: filters.budgetMin,
    condition: filters.condition,
    lotSize: filters.lotSize,
    market: filters.market,
    propertyCategory: filters.propertyCategory,
    propertySubtype: filters.propertySubtype,
    serviceArea: filters.serviceArea,
    sort: filters.sort,
    squareFeet: filters.squareFeet,
  };
  return createHash("sha256").update(JSON.stringify(stableFilters)).digest("hex").slice(0, 24);
}

function sellerSearchSortExpression(sort: SearchBuyersInput["sort"]) {
  if (sort === "recently_active") {
    return Prisma.sql`COALESCE(buyer."lastRefreshedAt", buyer."updatedAt")`;
  }
  if (sort === "highest_budget") {
    return Prisma.sql`COALESCE(buyer."budgetMax", 0)`;
  }
  if (sort === "most_verified") {
    return Prisma.sql`COALESCE(active_badges.active_badge_count, 0)`;
  }
  return Prisma.sql`
    COALESCE(active_badges.active_badge_count, 0)::numeric * 8
      + LEAST(COALESCE(buyer."budgetMax", 0) / 250000, 20)
  `;
}

function sellerSearchCursorPredicate(sort: SearchBuyersInput["sort"], cursor: SellerSearchCursor) {
  if (sort === "recently_active") {
    return Prisma.sql`
      (sort_key < ${new Date(cursor.key)} OR (sort_key = ${new Date(cursor.key)} AND id > ${cursor.id}))
    `;
  }
  const key = new Prisma.Decimal(cursor.key);
  return Prisma.sql`(sort_key < ${key} OR (sort_key = ${key} AND id > ${cursor.id}))`;
}

function isSellerSearchSort(value: unknown): value is SearchBuyersInput["sort"] {
  return value === "recommended"
    || value === "recently_active"
    || value === "highest_budget"
    || value === "most_verified";
}
