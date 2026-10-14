# LA County Community Release Evidence — 2026-10-13

Release `la-county-06037-2026-07-12-v2-communities-2026-10-13` on Supabase project
`qfjcrhkjlczvzakxives`, approved by the product owner on 2026-10-13. Procedure:
`GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md`, "Community release".

## Pre-release state

- 661 staged areas; active: 88 cities, 304 ZCTAs, 3 neighborhoods (Encino,
  Northridge, Tarzana). One live v2 activation snapshot. Zero invalid active
  buyers. `20260927201152_add_tour_scheduling` was not yet applied.
- Read-only prechecks: all 266 inactive communities had current geometry and
  bboxes inside the County bbox; all nickname targets existed; no nickname term
  was already owned by another area.
- Drift found: `geography_admin.la_county_community_aliases()` existed outside
  every migration ledger, branch, and worktree. It was an owner-only (`postgres`)
  13-row nickname prototype keyed by stable IDs, with no dependents, and no
  search term in `service_area_search_terms` came from it. The migration drops
  and recreates it with the reviewed 30-row list, keeping the stable-ID keying.

## Rollback-only rehearsal (`npm run db:rehearse-la-communities`)

The first attempt stopped on the prototype's conflicting return type before any
change. After the migration reconciled it, the full rehearsal passed inside one
rolled-back transaction:

| Check | Result |
| --- | --- |
| Unknown release / wrong manifest ledger / premature rollback | rejected |
| Activation | 266 activated, 269 neighborhoods, 30 nickname terms |
| Second activation | idempotent |
| Counts after activation | 88 cities, 304 ZCTAs, 269 neighborhoods, 0 invalid active buyers |
| Lookups | Granada Hills term active, NoHo alias, Los Angeles `SEARCH_ROLLUP` to Granada Hills |
| v2 activation invariant with overlay | idempotent pass |
| v2 rollback while communities live | rejected |
| Community rollback with a published buyer in Granada Hills | rejected |
| Community rollback | 266 deactivated, 0 community terms, exact v2 state |
| Reactivating a rolled-back release | rejected |
| Outer transaction rollback | production state unchanged |

The tour-scheduling and foreign-key migrations were also executed once inside
rolled-back transactions against production before Prisma applied them.

## Production changes

`prisma migrate deploy` applied, with checksums equal to the repository files:

| Migration | SHA-256 |
| --- | --- |
| `20260927201152_add_tour_scheduling` | `1a6fb01c7afacab7625024a32a28a91b98200f0a71d885ccc5d59fb148f8b9ff` |
| `20261013090000_activate_la_county_communities` | `dad86c6d76df7eeda7d47e18c3b1fcd026e546f71a548382b50fcc731a8cb287` |
| `20261013100000_cover_tour_and_property_decision_foreign_keys` | `b429b53f34d17995735de4dcb644905dcf784fcbc8deb83d5b368116dd4b9d07` |

`--activate-communities` returned `activatedCommunities: 266`,
`activeNeighborhoods: 269`, `newAliasTerms: 30`. A repeat run returned
`idempotent: true`.

## Post-release verification

- `--status`: 661 active areas (88 cities, 304 ZCTAs, 269 neighborhoods), one
  live community snapshot, zero unresolved migrations, zero invalid active buyers.
- All five new or replaced `geography_admin` functions are executable only by
  `postgres`; `anon`, `authenticated`, and `service_role` have no `EXECUTE`.
- Deployed production search API (`liber-one.vercel.app`, pre-deploy code via
  `search_active_service_areas`): `Granada Hills`, `NoHo`, `altadena`, and
  `91344` resolve; `sherman oa` suggests Sherman Oaks and 91423.
- Database lookup: `dtla`, `van nuys`, and `east la` resolve exactly.
- Supabase performance advisor: the four unindexed foreign keys
  (`TourSchedule` proposer/actor, `PropertyVerificationDecision` government-ID
  and address-evidence documents) are covered; only informational unused-index
  notices remain.
- Supabase security advisor: no new findings. Remaining items predate this
  release: PostGIS in `public` (`spatial_ref_sys` RLS and `st_estimatedextent`
  executable by `anon`/`authenticated`, which require the Supabase-supported
  PostGIS remediation), leaked-password protection disabled in Auth, and
  informational "RLS enabled, no policy" notices on server-only tables.

## Open operational finding

The deployed `vercel.json` defines no cron jobs, so `EmailOutbox` is never
drained: 8 `PENDING` rows (2 `INVITE`, 6 `LOI_UPDATE`, oldest 2026-08-12) have
zero attempts. The working-tree `vercel.json` adds per-minute crons; deploying it
requires a Vercel plan that allows minute-level crons. This matches the existing
"restore scheduled maintenance" public-launch blocker.

## Rollback

`npm run db:release-la-geography -- <manifest> --rollback-communities` with
`LA_GEOGRAPHY_RELEASE_ALLOW_ROLLBACK=true` and
`LA_GEOGRAPHY_RELEASE_ROLLBACK_CONFIRM=la-county-06037-2026-07-12-v2-communities-2026-10-13:rollback`.
It refuses while any published buyer has selected one of the 266 communities.
