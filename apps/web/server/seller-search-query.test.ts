import { beforeAll, describe, expect, it } from "vitest";
import type { SearchBuyersInput } from "@liber/validators";

type QueryModule = typeof import("./seller-search-query");

let queryModule: QueryModule;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/liber_test";
  queryModule = await import("./seller-search-query");
});

describe("SQL-native seller search", () => {
  it("builds canonical market geography and every supported SQL filter", async () => {
    const { searchBuyersSchema } = await import("@liber/validators");
    const filters = searchBuyersSchema.parse({
      amenities: ["Pool", "ADU"],
      badges: ["PRE_APPROVED", "VERIFIED_FUNDS"],
      bathrooms: 2,
      bedrooms: 4,
      budgetMax: 1_500_000,
      budgetMin: 900_000,
      condition: "Fixer",
      lotSize: 7_500,
      market: "los-angeles",
      pageSize: 40,
      propertyCategory: "HOME",
      propertySubtype: "HOME",
      serviceArea: "same-name-market",
      sort: "most_verified",
      squareFeet: 2_000,
    });
    const query = queryModule.buildSellerSearchQuery(filters, new Date("2026-07-09T20:00:00.000Z"));
    const sql = query.sql;

    expect(sql).toContain("WITH RECURSIVE coverage");
    expect(sql).toContain("selected_market.slug");
    expect(sql).toContain("buyer_market.slug");
    expect(sql).toContain("relationship.relation_type::text = 'SEARCH_ROLLUP'");
    expect(sql).toContain('buyer."budgetMax" >=');
    expect(sql).toContain('buyer."budgetMin" <=');
    expect(sql).toContain('criteria."bedroomsMin"');
    expect(sql).toContain('criteria."bathroomsMin"');
    expect(sql).toContain('criteria."squareFeetMin"');
    expect(sql).toContain('criteria."lotSizeMin"');
    expect(sql).toContain("condition_criteria.condition");
    expect(sql).toContain("amenity_criteria.features @>");
    expect(sql).toContain('required_badge."badgeType"');
    expect(sql).toContain("ORDER BY sort_key DESC, id ASC");
    expect(sql).toContain("LIMIT");
    expect(query.values).toContain("los-angeles");
    expect(query.values).toContain("same-name-market");
    expect(query.values).toContain(41);
  });

  it("round-trips opaque cursors and rejects malformed or sort-mismatched cursors", async () => {
    const cursor = queryModule.encodeSellerSearchCursor({
      filterHash: queryModule.sellerSearchFilterHash(searchFilters({ sort: "most_verified" })),
      id: "buyer-101",
      key: "24",
      snapshotAt: "2026-07-09T20:00:00.000Z",
      sort: "most_verified",
      version: 1,
    });

    expect(queryModule.decodeSellerSearchCursor(cursor)).toMatchObject({
      id: "buyer-101",
      key: "24",
      sort: "most_verified",
    });
    expect(() => queryModule.decodeSellerSearchCursor("not-a-cursor")).toThrow("Invalid seller search cursor");

    await expect(queryModule.querySellerSearchIds(
      { $queryRaw: async <T>() => [] as T },
      searchFilters({ cursor, sort: "highest_budget" }),
      new Date("2026-07-09T20:05:00.000Z"),
    )).rejects.toThrow("does not match the current filters");
  });

  it("rejects replayed and future-dated cursor snapshots", async () => {
    const now = new Date("2026-07-09T20:31:01.000Z");
    const oldCursor = queryModule.encodeSellerSearchCursor({
      filterHash: queryModule.sellerSearchFilterHash(searchFilters()),
      id: "buyer-101",
      key: "8",
      snapshotAt: "2026-07-09T20:00:00.000Z",
      sort: "recommended",
      version: 1,
    });
    const futureCursor = queryModule.encodeSellerSearchCursor({
      filterHash: queryModule.sellerSearchFilterHash(searchFilters()),
      id: "buyer-101",
      key: "8",
      snapshotAt: "2026-07-09T20:32:02.000Z",
      sort: "recommended",
      version: 1,
    });

    await expect(queryModule.querySellerSearchIds(
      { $queryRaw: async <T>() => [] as T },
      searchFilters({ cursor: oldCursor }),
      now,
    )).rejects.toThrow("cursor has expired");
    await expect(queryModule.querySellerSearchIds(
      { $queryRaw: async <T>() => [] as T },
      searchFilters({ cursor: futureCursor }),
      now,
    )).rejects.toThrow("cursor has expired");
  });

  it("paginates more than 100 equal-key buyers without omissions or duplicates during an insert", async () => {
    const snapshot = new Date("2026-07-09T20:00:00.000Z");
    const originalRows = Array.from({ length: 137 }, (_, index) => ({
      createdAt: new Date(snapshot.getTime() - 60_000),
      id: `buyer-${String(index).padStart(3, "0")}`,
      sortKey: "8",
    }));
    const rows = [...originalRows];
    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const filters = searchFilters({ cursor, pageSize: 19, sort: "most_verified" });
      const decoded = cursor ? queryModule.decodeSellerSearchCursor(cursor) : null;
      const client = {
        $queryRaw: async <T>() => {
          const eligible = rows
            .filter((row) => row.createdAt <= new Date(decoded?.snapshotAt ?? snapshot))
            .sort((left, right) => left.id.localeCompare(right.id));
          const start = decoded ? eligible.findIndex((row) => row.id === decoded.id) + 1 : 0;
          return eligible.slice(start, start + filters.pageSize + 1) as T;
        },
      };
      const page = await queryModule.querySellerSearchIds(client, filters, snapshot);
      seen.push(...page.ids);
      cursor = page.nextCursor ?? undefined;

      if (seen.length === 19) {
        rows.push({
          createdAt: new Date(snapshot.getTime() + 1_000),
          id: "buyer-concurrent-insert",
          sortKey: "8",
        });
      }
    } while (cursor);

    expect(seen).toHaveLength(137);
    expect(new Set(seen).size).toBe(137);
    expect(seen).toEqual(originalRows.map((row) => row.id));
    expect(seen).not.toContain("buyer-concurrent-insert");
  });
});

function searchFilters(overrides: Partial<SearchBuyersInput> = {}): SearchBuyersInput {
  return {
    amenities: [],
    badges: [],
    market: "los-angeles",
    pageSize: 24,
    sort: "recommended",
    ...overrides,
  };
}
