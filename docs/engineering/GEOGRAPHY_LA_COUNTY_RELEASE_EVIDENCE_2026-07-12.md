# LA County Geography Release Evidence — July 12, 2026

## Release identity

- Dataset: `la-county-06037-2026-07-12-v2`
- County: Census GEOID `06037`
- Manifest SHA-256: `2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47`
- Relationships SHA-256: `5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8`
- Generated display SHA-256: `55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443`
- Migration SHA-256: `deca5831a19a37330ffffc7c64975274d609907e3954f1a3793f00d6514a7e73`

Source bundle ledger:

```text
b0eae3a45fde00d8ebcdafa4af15e76b3c748b80ef3ad487939f5102ca5d2b3c  county.geojson.gz
be924fb99c115951c5c55e9649a7347c2d276d9fc1e93343387382c6492ed09c  csa-land.geojson.gz
602717ff8afa0b584f3b2a8f61e8abce80b58d2705b723096d1d18cbc739090f  legal-city.geojson.gz
9568435e664107743b6bdba00c70b7ed9bcf9c668d38493dc26ecf128bd23fe5  zcta.geojson.gz
```

## Deterministic data proof

- 661 canonical service areas: 88 cities, 269 statistical communities, 304 ZCTAs.
- 298 reviewed relationships: 149 `DISPLAY_PARENT`, 149 `SEARCH_ROLLUP`, zero inferred ZCTA relationships.
- 91 County Public Works legal-city land components across 88 distinct city names.
- V2 canonical area geometry/identity and relationship edge set match v1; the legal-city bundle is display-only.
- Builder ran twice with byte-identical output.
- Validator passed the ledger, compressed and decompressed hashes/sizes, source feature counts/IDs, per-area source hashes, and relationship evidence.

## Database rehearsal

The final migration bytes were executed against the current production schema inside an outer transaction and then rolled back. The 71.1-second rehearsal restored the exact baseline: 15 rows/15 active areas with no new version tables afterward.

Observed inside the rehearsal:

- First stage: 661 areas, 661 geometry versions, 393 display features, 15 existing active areas untouched, zero pointer/bounds/live-relationship changes.
- Second stage: idempotent no-op.
- Wrong raw ledger hashes and altered CSA bundle JSON were rejected before a dataset row could be written.
- A savepoint-protected inactive Encino sentinel proved that staging does not mutate any existing service-area metadata.
- Display bundle: 393 features, 959,052 JSON bytes, 358,669 PostgreSQL stored bytes, no UUID-shaped values, no properties outside `kind`, `slug`, and `label`.
- Activation: 88 cities, 304 ZCTAs, three preserved neighborhoods, 661 current geometry pointers, County bbox `[-118.951721, 32.75004, -117.646374, 34.823302]`.
- Exact `91325` resolved uniquely to ZCTA `91325`; exact `Northridge` resolved uniquely to the reviewed neighborhood despite legacy aliases.
- Second activation: idempotent no-op.
- Search-term and relationship ownership drift caused rollback to fail closed.
- Preexisting rows falsely claiming the v2 source and additive v2-owned term/relationship keys were rejected.
- An `ACTIVE` buyer depending on a newly activated area caused rollback to fail before mutation.
- Safe rollback restored the prior 15 active areas, preserved preexisting terms/relationships, retained immutable staged evidence/source IDs, and left zero v2-owned live term/relationship rows.
- Outer transaction: rolled back, leaving production unchanged.

## Application verification

- `npm run db:validate` — passed.
- `npm run db:generate` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: root guards 9/9, web 146 passed with 5 guarded skips, validators 13/13.
- Focused LA/map/API suite — passed.
- `npm run lint` — zero errors; one unrelated existing `<img>` optimization warning remains.
- `npm run build` — passed; the market-boundary API route is present in the production route manifest.
- `git diff --check` — passed (Windows line-ending notices only).
- `npm run smoke:routes` — passed.
- `npm run smoke:security` — passed.
- `npm run smoke:no-auth-bypass` — passed.
- `npm run smoke:visual` — passed for desktop home/login/signup and mobile home/login.
- `npm run readiness:env` — passed while reporting missing `CRON_SECRET`, email delivery configuration, and Auth rate-limit pepper. Vercel cron schedules remain separately and intentionally disabled for the controlled preview.

## Production reconciliation

Completed against Supabase project `qfjcrhkjlczvzakxives` on July 12, 2026:

- Prisma migrations `20260712090000_expand_la_county_geography` and `20260712100500_cover_service_area_search_term_market_fk` are applied. `prisma migrate status` reports all 21 migrations applied, and the production ledger has zero unresolved rows.
- Guarded stage committed 661 service areas and 661 immutable geometry versions while leaving the prior 15 active areas, market bounds, current pointers, search terms, and live relationships unchanged.
- Guarded activation committed 395 active areas: 88 cities, 304 approximate ZCTAs, and Encino, Northridge, and Tarzana. All 661 areas have current geometry pointers; there is one display version, one dataset ledger, one unrolled-back activation snapshot, and zero invalid active buyers.
- The live market label is `Los Angeles County`, its bbox is `[-118.951721, 32.75004, -117.646374, 34.823302]`, and both County and display-geometry pointers are present.
- Production search resolved exact `91325`, `Northridge`, and `Los Angeles` deterministically. Public responses omitted database UUIDs.
- The versioned boundary endpoint returned 200 with 393 features (one County, 88 city, 304 approximate ZIP), only `kind`, `label`, and `slug` properties, an immutable cache policy, and an ETag; the matching conditional request returned 304. Selected-area geometry returned a safe GeoJSON Feature with the same cache/ETag behavior.
- Desktop browser acceptance proved pan, zoom, `View all LA County`, the County/city/ZIP boundary layers, and zero console errors. Mobile acceptance at 390×844 proved the responsive navigation, ZIP selection, boundary legend, controls, and cooperative gestures: a one-finger gesture over the map scrolled the page while the map required two fingers to pan.
- Supabase security/performance advisors reported no warning or error attributable to the LA geography tables. The follow-up composite index migration removed the release-specific unindexed-foreign-key finding. Newly created indexes remain expected `unused_index` informational notices until representative traffic exists.
- Existing unrelated advisor work remains: public-schema PostGIS/`spatial_ref_sys` findings, leaked-password protection, two `PropertyVerificationDecision` unindexed foreign keys, and the duplicate `Invite` index.
- Runtime release commit `bc3ff92` and follow-up index commit `e0a35e6` were pushed to `main`. Vercel production deployments `liber-fg721soaw-roberts-projects-2c330010.vercel.app` and `liber-5y2y3vlrl-roberts-projects-2c330010.vercel.app` reached Ready; the latter was the current `liber-one.vercel.app` alias when reconciliation completed.
