# LA Geography Security Hardening Evidence — July 13, 2026

## Scope and verdict

Migrations `20260713051527_harden_la_geography_security`, `20260713054016_close_public_function_defaults`, and `20260713054720_consolidate_service_area_prefix_index` are applied to Supabase project `qfjcrhkjlczvzakxives`. They close direct browser access to canonical geography, make the prefix lookup indexable, make future public-schema privileges effectively opt-in, consolidate the duplicate search indexes, and replace migration-head readiness with complete-set reconciliation.

The contained LA hardening is verified. Liber remains a controlled preview and is **not approved for true public production** because the Supabase-owned PostGIS findings, leaked-password protection, malware scanning, and scheduled-maintenance gates remain open.

## Live database proof

The production catalog reported:

- zero `anon` or `authenticated` table-privilege rows across `markets`, `service_areas`, `service_area_relationships`, and `buyer_desired_service_areas`;
- 16 `service_role` privilege rows across those tables: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on each;
- RLS enabled on all four tables;
- all 24 checked-in Prisma migrations represented by successful, non-rolled-back rows, with no missing, unresolved failed, rolled-back-only, or database-only migration names.

Effective scratch-object checks confirmed that new `postgres`-owned public-schema tables, sequences, and functions grant no access to `anon`, `authenticated`, or `service_role`. The additive global revoke is required because a schema-scoped function default cannot override PostgreSQL's built-in `PUBLIC EXECUTE` default. The geography search function remains `SECURITY INVOKER` and has no execute grant for `PUBLIC`, `anon`, `authenticated`, or `service_role`.

## Runtime and plan proof

- A raw publishable-key Supabase Data API request to `rest/v1/markets` returned `401` and no table data.
- `GET /api/service-areas/search?market=los-angeles&q=91325` returned `200`, two safe suggestions, and no database UUID.
- `EXPLAIN` of the complete search-function query under the default production planner selected `service_area_search_terms_market_term_prefix_idx` with both lexical bounds in its index condition. The proof did not disable sequential scans.

These results demonstrate the intended split: raw canonical tables are not a browser API, while the narrow server route continues to serve safe public metadata.

## Remaining supported-platform gates

The following findings were not changed by the application migration because the objects are owned by `supabase_admin`:

- `public.spatial_ref_sys` remains an exposed-schema/RLS advisor finding;
- the PostGIS extension remains installed in `public`;
- the three `st_estimatedextent` overloads remain advisor findings for execution by `anon` and `authenticated`.

Do not hot-move PostGIS or reassign platform-owned objects. Close these findings through a Supabase-supported platform path, then re-run the advisors and direct privilege checks.

Supabase Auth leaked-password protection also remains disabled. This verification had neither an authenticated Dashboard session nor a supported Management API control for that setting. Enable it in the authenticated Supabase Auth controls and re-run the Auth security advisor before public launch.

The post-migration advisor rerun returned 35 security findings: 26 informational deny-by-default RLS notices, one `spatial_ref_sys` error, and eight warnings covering PostGIS placement, the six anonymous/authenticated `st_estimatedextent` findings, and leaked-password protection. The performance rerun returned 39 informational findings and one warning; the LA-related entries were informational unused-index observations only. Advisor state therefore remains yellow for the explicit platform/Auth gates above, not for the app-owned geography boundary or query plan.

## Operational interpretation

The LA geography architecture does not need redesign. The safe boundary is now explicit: deterministic Liber-owned geography, server-mediated public reads, default-deny raw browser access, indexed prefix search, and complete migration-ledger reconciliation. The unresolved platform and launch gates above must remain visible; this evidence is not a public-launch approval.
