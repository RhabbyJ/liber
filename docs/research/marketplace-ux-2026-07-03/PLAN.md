# Marketplace UX Simplification Plan

Date: 2026-07-03

## Goal

Simplify Liber's public homepage, auth entry, buyer profile setup, and seller filtering into a map-first marketplace experience that feels closer to Zillow, Redfin, and Airbnb while preserving Liber v1 security and privacy rules.

Success means:

- The public homepage makes buyer demand obvious in the first viewport with one dominant seller action and one secondary buyer action.
- Auth entry is predictable: top-right login, one get-started path, no role confusion, no duplicate account loops.
- Seller search behaves like a professional marketplace filter system: map first, filter controls near the map, backed controls only, same result set for map and cards.
- Buyer profile criteria and seller filters use matching labels/options so buyers understand what sellers will filter on.
- No public full buyer search, no exact buyer locations, no private documents, and no unsupported v1 product claims.

## Evidence Captured

Screenshots are in this folder:

- `00-contact-sheet.png`
- `01-zillow-home.png`
- `02-zillow-search-map.png` - Zillow search hit human verification; not bypassed.
- `03-zillow-auth-attempt.png` - Zillow domain remained blocked after verification wall.
- `04-redfin-home.png`
- `05-redfin-auth-modal.png`
- `06-liber-current-home.png`
- `07-liber-current-login.png`

External references used:

- Zillow homepage: https://www.zillow.com/
- Zillow filter help: https://zillow.zendesk.com/hc/en-us/articles/203523760-How-do-I-search-for-homes
- Zillow advanced search guide: https://www.zillow.com/learn/zillow-advanced-search/
- Redfin homepage: https://www.redfin.com/
- Airbnb search filters: https://www.airbnb.com/help/article/479
- Airbnb filter categories: https://www.airbnb.com/help/article/3740
- Airbnb search/map behavior: https://www.airbnb.com/help/article/39

## Competitive Patterns To Copy

1. Search starts simple.
   Zillow and Redfin do not expose every filter on the homepage. They lead with one location/search field, then reveal filters in the search workspace. Airbnb similarly starts with location/date/guest intent and pushes complexity into filters.

2. Auth is small and conventional.
   Redfin uses one top-right "Join / Sign in" button and a compact modal: email first, then Google/Apple. The homepage remains visible behind auth. For Liber, role intent can be preserved through URLs, but the form should stay compact and predictable.

3. Filters are grouped and applied deliberately.
   Zillow groups listing type, price, beds/baths, home type, and more. Airbnb groups type of place, price range, rooms/beds, and amenities. Each filter either changes results or is not shown.

4. Map and list are peers.
   Zillow/Redfin use map/list together. Airbnb documents that map results help users understand geographic distribution. Liber should keep the same filtered buyer set in map pins and buyer cards.

5. Save/notify actions are auth-gated secondary actions.
   Zillow prompts sign-in for saved search. Redfin uses account state for favorites/saved search. Liber should not show dead "Save search" UI until it is backed by behavior.

## Current Liber Gaps

- Homepage: the visual smoke capture shows a large blank map area stuck on "Loading buyer demand map." The right buyer-demand rail works, but the first impression is weaker than Zillow/Redfin because the main canvas appears empty.
- Homepage/nav: there are multiple signup paths (`Find buyers`, `I'm a buyer`, `Get started`, `For Buyers`, `For Sellers`). This creates role noise.
- Auth: login is functional and clean, but it is a full page with a large footer and separate role-aware copy. The market pattern is a compact account entry with role intent carried by context.
- Seller filters: `SearchFiltersSidebar` has mockup defaults, a non-draggable visual slider, unsupported property-type choices where SFR/Condo/Townhome all map to `HOME`, and an `Off-market only` checkbox that never affects submitted search.
- Seller search: `Save search` is a dead button. Remove or back it with a real auth-gated saved search later.
- Buyer cards: row cards contain hardcoded "Looking in" neighborhoods based on buyer name and a client-computed match percent. These read like fake production intelligence unless they come from real criteria/search scoring.
- Visual smoke: `npm run smoke:visual` currently fails because `/signup` no longer includes the expected "Sign up" marker.

## Execution Plan

1. Repair baseline visual verification.
   Change: update `scripts/visual-smoke.mjs` markers for the current signup wizard and add a seller-search screenshot target when a safe seeded/approved seller session is available.
   Verify: `npm run smoke:visual` passes and writes desktop/mobile screenshots.

2. Simplify public homepage hierarchy.
   Change: keep the map-first preview but reduce visible CTAs to one primary seller action (`Find buyers`) and one secondary buyer action (`Add my buyer demand`). Convert extra nav role links into restrained text links or remove them from the first viewport. Ensure fallback map never looks blank: if Mapbox is unavailable, show static budget pins or an intentionally styled empty map state.
   Verify: desktop and mobile screenshots show the map/pins/cards above the fold, no stuck loading state, no more than two first-viewport CTAs, and no public buyer profile links.

3. Normalize auth entry.
   Change: make top-right auth match the pro pattern: `Log in` plus one primary `Get started`. Keep role intent in `next` and `role` params, but avoid presenting buyer/seller choices in multiple places at once. Consider a compact auth card/modal style later, but preserve server-side auth redirects and Supabase flow.
   Verify: auth intent tests pass; `/signup?role=seller&next=/seller/search`, `/signup?role=buyer&next=/buyer/profile`, and opposite-role signed-in flows land correctly.

4. Rebuild seller filters as backed marketplace controls.
   Change: remove unsupported/dead controls (`Off-market only`, fake subtype pills, dead save search). Replace the visual-only budget slider with either real range inputs plus select fields or simple Zillow-style min/max dropdowns. Group filters as Location, Budget, Home fit, Buyer trust, More. Keep a single `Update matches` action and a quiet `Clear` action.
   Verify: tests cover budget range overlap, location/radius, beds/baths/sqft, amenities, condition, and active badges. URL params reflect every visible filter and no invisible filter.

5. Make map-first seller search feel like Zillow/Redfin.
   Change: put filters in a compact sidebar on desktop and a filter sheet/button near the map on mobile. Keep map on top/default; buyer cards sit beside or below it. Add active filter chips above results so sellers can see and remove applied filters quickly.
   Verify: map and cards use the same `searchBuyers` result count; filter button is visible near the map; mobile screenshots show no overlapping controls.

6. Align buyer profile criteria with seller filters.
   Change: reuse the same option vocabulary for budget, beds, baths, sqft, amenities, condition, and trust/badge language. Buyer setup should feel like "make yourself searchable" rather than a long generic profile form.
   Verify: buyer profile submit tests assert criteria save with canonical amenity tokens (`Pool`, `Parking`, `ADU`, `Yard`, `Garage`) and condition values used by seller filters.

7. Replace fake fit signals with source-backed fit summaries.
   Change: remove hardcoded neighborhoods and client-only match scores from `BuyerCard`. Replace with real criteria facts and "Fit highlights" derived from the search query/result, or omit until backed.
   Verify: no buyer-card display text is derived from buyer name heuristics; tests or snapshots cover card output for active badges and criteria.

8. Product/security review pass.
   Change: update `docs/product/V1_DEFINITION.md`, `docs/engineering/BACKEND_ARCHITECTURE.md`, and relevant `docs/sections/*.md` only if behavior changes. Preserve seller-access gates and public preview limits.
   Verify: `npm run typecheck`, targeted tests, `npm run smoke:routes`, `npm run smoke:security`, `npm run smoke:no-auth-bypass`, and `npm run smoke:visual`.

## Non-goals

- Do not make public full buyer search.
- Do not make buyer profiles public/crawlable.
- Do not add payments, escrow, offers, subscriptions, or lender workflow.
- Do not add filters based on protected-class proxies or unnecessary personal characteristics.
- Do not add fake production buyers, fake trust signals, or fake match scores.
