# Seller Search SQL Evidence — 2026-07-09

## Scope

This evidence covers the SQL-native seller search query and the unnumbered index proposal in `SELLER_SEARCH_SQL_PROPOSAL.sql`. It does not change or apply production migrations.

The benchmark uses the exact application query builder with `pg_temp` tables on Postgres. Temporary data is connection-scoped and was dropped automatically; no persistent application rows or indexes were changed.

## Query contract exercised

Input:

- required active `market` slug,
- optional market-scoped canonical `serviceArea` slug,
- budget-overlap, property category/subtype, beds, baths, sqft, lot size, condition, canonical amenities, and active badge filters,
- `sort`: `recommended`, `recently_active`, `highest_budget`, or `most_verified`,
- `pageSize`: default 24, maximum 100,
- opaque `cursor` returned by the prior page.

Output:

```ts
{
  items: Buyer[]; // unchanged seller-safe DTO
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
    pageSize: number;
    snapshotAt: string;
  };
}
```

The cursor binds the filter/sort fingerprint, the first-page snapshot timestamp, the last sort key, and buyer ID. SQL orders by `sort_key DESC, id ASC`. Profiles created after `snapshotAt` are excluded from every later page, and badge activity is evaluated at the same snapshot.

## Data and assertions

Command:

```txt
SELLER_SEARCH_TEMP_BENCHMARK=true vitest run server/seller-search-query.benchmark.test.ts
```

Dataset:

- 25,001 active buyer profiles across two active markets,
- the same service-area slug in both markets,
- 137 buyers under a reviewed `SEARCH_ROLLUP` descendant used for complete cursor traversal,
- generated budget, property type, beds, baths, sqft, lot size, condition, amenities, badges, and activity times,
- the proposed indexes applied only to temporary tables.

Results:

- all 137 selected-market buyers traversed for every sort with no duplicate IDs,
- concurrent matching insert after page one was excluded by the first-page snapshot,
- the same-name service-area buyer in the other market was excluded,
- every supported filter executed in SQL and returned a nonempty bounded subset,
- all benchmark assertions passed.

## EXPLAIN ANALYZE

Measured on 25,001 temporary buyer rows with `recently_active`, a page size of 100, and no service-area restriction:

```json
{
  "actualRows": 101,
  "executionTimeMs": 1.716,
  "planningTimeMs": 0.757,
  "rootNode": "Limit",
  "scans": [
    "Index Scan:benchmark_buyer_active_recency_idx",
    "Seq Scan:markets",
    "Seq Scan:service_areas",
    "Index Only Scan:benchmark_selection_area_idx",
    "Index Scan:User_pkey"
  ],
  "tempReadBlocks": 0,
  "tempWrittenBlocks": 0
}
```

The 101 returned plan rows are deliberate (`pageSize + 1`) so the contract can set `hasMore` without a count query. Small metadata tables used sequential scans; the buyer order, canonical selection join, and user join used indexes. The plan did not spill to temporary disk.

## Interpretation and follow-up

This is realistic synthetic evidence, not a substitute for production-distribution measurement. Before CTO integration applies indexes:

1. run `EXPLAIN (ANALYZE, BUFFERS)` on a masked/staging copy with production-like badge and criteria cardinality,
2. compare all four sorts and selective/nonselective geography,
3. keep only indexes that materially improve measured plans,
4. run Supabase advisors after the final migration,
5. watch `recommended` and `most_verified` as cardinality grows because active-badge aggregation makes those sorts less index-friendly than recency and budget.
