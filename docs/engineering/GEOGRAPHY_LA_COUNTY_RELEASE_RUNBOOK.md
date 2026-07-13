# LA County Geography Release Runbook

This runbook owns the deterministic Los Angeles County v1 geography release.

## Approved release

- Dataset: `la-county-06037-2026-07-12-v2`
- County: Census GEOID `06037`
- Active allowlist: 88 incorporated cities and 304 approximate 2020 Census ZCTAs
- Preserved active neighborhoods: Encino, Northridge, and Tarzana
- Inactive retained communities: 266 additional County statistical communities
- Display bundle: one County outline, 88 legal-city outlines, and 304 approximate ZCTA outlines
- ZIP-to-city inference: none

The manifest checksum is `2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47`. The relationship checksum is `5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8`.
The deterministic PostGIS display bundle checksum is `55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443` (393 features, 959,052 JSON bytes in the production rehearsal).

## Source policy

- County boundary: U.S. Census Bureau County geography.
- Canonical ZCTA membership: official 2020 ZCTA-to-County relationship file, not an intersection query.
- Canonical city/community service areas and reviewed relationships: LA County CSA source.
- Legal-city orientation outlines: LA County Public Works Political Boundaries layer, 91 land components dissolved to 88 city names.

ZCTAs are approximate ZIP service areas, not official USPS delivery boundaries. County and city data are informational and not survey-grade legal evidence. Runtime code never calls these providers.

## Preflight

```bash
npm run db:import-service-areas -- data/geography/los-angeles-county/la-county-06037-2026-07-12-v2/manifest.json --validate-only
npm run db:validate
npm run typecheck
npm test
npm run build
```

Run the checked-in migration/stage/activation rehearsal. It verifies that the migration contains exactly one outer `BEGIN`/`COMMIT` pair, removes only those wrappers, executes inside its own transaction, and proves the original schema/counts after rollback. Never wrap and execute `migration.sql` verbatim because its own `COMMIT` would end the outer transaction.

Required rehearsal settings:

```text
LA_GEOGRAPHY_REHEARSAL_DATABASE_URL=<guarded Supabase database URL>
LA_GEOGRAPHY_REHEARSAL_ALLOW_ROLLBACK_ONLY=true
LA_GEOGRAPHY_REHEARSAL_CONFIRM=la-county-06037-2026-07-12-v2
LA_GEOGRAPHY_REHEARSAL_PROJECT_REF=<exact project ref>
```

```bash
npm run db:rehearse-la-geography
```

The evidence must show:

- first stage: 661 areas, 661 geometry versions, 393 display features, no live changes;
- second stage: `idempotent: true`;
- wrong ledger hashes, altered source bundles, and existing-row staging mutations are rejected;
- activation: 88 cities, 304 ZCTAs, three preserved neighborhoods, 661 current geometry pointers;
- second activation: `idempotent: true`;
- release-owned metadata drift, additive or pre-owned release keys, and buyer-invalidating rollback are rejected;
- rollback: prior 15 active areas restored;
- outer transaction rollback: shared state unchanged.

## Production sequence

Use this sequence for repeat or replacement targets:

1. Apply `20260712090000_expand_la_county_geography`, `20260712100500_cover_service_area_search_term_market_fk`, `20260713051527_harden_la_geography_security`, `20260713054016_close_public_function_defaults`, and `20260713054720_consolidate_service_area_prefix_index` through Prisma.
2. Run the exact-hash stage action.
3. Confirm the status reports 661 rows/versions while the prior 15 areas and pilot bbox remain live.
4. Deploy the pointer-aware application and boundary API.
5. Run the exact-hash activation action.
6. Confirm 88 active cities, 304 active ZCTAs, three active neighborhoods, one current County boundary, one current display bundle, and zero invalid active buyers.
7. Test desktop and mobile pan/zoom, View all LA County, no ambient border overlays, city/ZIP search, selected geometry and clearing, and public privacy.
8. Re-run Supabase security and performance advisors.
9. Reconcile the complete local migration set against `_prisma_migrations`; fail for a missing, unresolved failed, or rolled-back-only local migration.
10. Verify zero `anon`/`authenticated` table privileges across the four canonical geography tables, RLS on all four, raw Data API denial, a working narrow search API with no UUIDs, and default-planner use of `service_area_search_terms_market_term_prefix_idx`.

The initial production release completed on 2026-07-12, with `20260712100500_cover_service_area_search_term_market_fk` applied after activation as the advisor-driven follow-up. The raw-access and prefix-plan hardening migration, global function-default correction, and index consolidation were applied on 2026-07-13. Future targets apply all five migrations in step 1. Release counts, checksums, API/browser acceptance, and deployment identities are recorded in `GEOGRAPHY_LA_COUNTY_RELEASE_EVIDENCE_2026-07-12.md`; the hardening and complete-ledger proof is recorded in `GEOGRAPHY_LA_SECURITY_HARDENING_EVIDENCE_2026-07-13.md`.

The release command requires a dedicated connection env plus all of:

```text
LA_GEOGRAPHY_RELEASE_ALLOW_WRITES=true
LA_GEOGRAPHY_RELEASE_CONFIRM=la-county-06037-2026-07-12-v2
LA_GEOGRAPHY_RELEASE_PROJECT_REF=<exact project ref>
```

Commands:

```bash
npm run db:release-la-geography -- <manifest> --status
npm run db:release-la-geography -- <manifest> --stage
npm run db:release-la-geography -- <manifest> --activate
```

The command validates the external ledger before connecting, requires the database migration checksum to match the checked-in SQL exactly, pins writes to the confirmed Supabase project ref, serializes supported release writes with a transaction advisory lock, wraps each write in a short transaction, and prints only aggregate reconciliation data.

## Rollback

Rollback requires the standard write confirmation plus:

```text
LA_GEOGRAPHY_RELEASE_ALLOW_ROLLBACK=true
LA_GEOGRAPHY_RELEASE_ROLLBACK_CONFIRM=la-county-06037-2026-07-12-v2:rollback
```

Then run:

```bash
npm run db:release-la-geography -- <manifest> --rollback
```

Rollback restores prior active flags, current pointers, complete service-area metadata, and market bounds. The activation snapshot preserves preexisting matching terms/relationships so rollback deletes only keys created by this release. Immutable dataset/geometry evidence, staged inactive rows, and stable source identities remain.

Rollback fails before mutation if any `ACTIVE` buyer depends on an area that the rollback would deactivate. Move each affected profile through the supported draft and service-area reselection workflow, then retry; rollback never silently drafts or republishes a buyer.

After rollback, deploy the prior compatible application version and verify the 15-area pilot. Never delete retained versions or rewrite an applied migration.
