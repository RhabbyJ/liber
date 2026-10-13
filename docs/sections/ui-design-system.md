# Section: UI Design System

## Purpose

Owns shared visual language, navigation, layouts, reusable components, and global CSS.

## Main files

- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/components/account-menu.tsx`
- `apps/web/components/primary-nav.tsx`
- `apps/web/components/primary-nav-items.ts`
- `apps/web/components/page-title.tsx`
- `apps/web/components/empty-state.tsx`
- `apps/web/components/icon.tsx`
- `apps/web/components/stat.tsx`
- `apps/web/components/site-footer.tsx`
- `apps/web/components/filter-popover.tsx`
- `apps/web/components/search-view-toggle.tsx`
- `apps/web/components/sort-select.tsx`
- `apps/web/lib/listing-format.ts`
- `apps/web/app/fonts/open-sans-latin-wght-normal.woff2` (OFL license in `apps/web/app/fonts/OFL-open-sans.txt`)

## Invariants

- UI must not be the only security control.
- Messaging is role-neutral under `/messages`. It must render content as inert
  text, preserve unsent text after recoverable errors, expose guided and
  plain-text paths, announce send/load errors accessibly, and clearly render
  read-only/blocked/offline states on mobile and desktop.
- CTAs should describe the actual action.
- Focused task-entry pages may use generous open-canvas spacing and a single high-emphasis input composition. Artwork must be original and brand-specific; visual references may guide hierarchy and proportions but not copied assets, brand colors, or product claims.
- Avoid essay callout cards, left-border status banners, three-step icon
  explainers, and stacked alert walls. Real status uses one `inline-alert`
  (tinted background, icon, one sentence, optional text link); legal or privacy
  copy is `fine-print` next to the action it qualifies. Account, admin, and
  profile pages use settings-style sections (`settings-section`, `settings-list`
  rows with chevrons, `status-list`) separated by hairlines, not shadowed cards.
- Keep mobile and keyboard accessibility in scope.
- Primary mobile navigation must remain usable during delayed or missing client hydration; keep menu contents/actions in the DOM and preserve the fallback behavior in `primary-nav.tsx`.
- Primary navigation remains visible on the desktop map-first homepage. Guests get Demand map, For buyers, and For sellers; authenticated links use distinct buyer/seller action labels so dual-role accounts do not receive ambiguous duplicate links.
- Authenticated desktop navigation uses the user's generated avatar as the account-menu trigger. The menu contains only `Your profile` and the POST-only `Sign out` action; mobile navigation exposes the same two account actions when the desktop trigger is hidden.
- The site header copies Zillow's bar: 60px (`--header-h` at every width) with one `#d1d1d5` hairline and no shadow, the logo centred, nav links on both sides of it (up to three links sit left; longer navs put their second half on the right, before the account actions). Links are 16/400 ink with full-height hit areas, 14px side padding at 1150px and up and 8px at 1024–1149px; seven or more links drop to 14px type below 1280px. The active link is bold with a 3px `#47a62f` bar over the hairline, and each link reserves its bold width so nothing shifts. Guests get a `Log in` text link and a 36px `Get started` button.
- Below 1024px the nav becomes a drop-down drawer under the bar: 54px rows with a 3px active bar, then the account actions as 48px buttons. The bar keeps the logo on the left (28px mark, per the CEO mobile mockup), `Log in` text for guests or the bell and avatar when signed in, and a 44px menu button whose three green bars squeeze into a close mark.
- The full footer uses Redfin's columns on `--surface-subtle`: For sellers, For buyers, and Liber at a 214px pitch (16/400 grey headings, 12/700 links on 34px rows; 14/700 on 40px rows on phones), a 12/16 legal column with the copyright line, then the original skyline (120px, 88px below 1024px, 64px on phones). Footer links only point at routes that resolve for the viewer: Messages follows the header nav (messaging flag plus a buyer or seller role), guests get Log in / Create an account, and signed-in users get Your profile. No terms, privacy, social, or app links exist for Liber, so none are shown.
- `/profile` is owner-only account identity. It may display the current session user's private name/email and workspace links, but those fields never become seller/public buyer identity.
- Page headers follow the listing portals: a plain H1 (32/40, 24/32 on phones), at most one short meta line under it, and actions on the right (`components/page-title.tsx`). Do not add uppercase eyebrows, kicker labels, subtitle paragraphs, or Buyer mode / Seller mode pills; workspace context comes from navigation and a `page-back` link where a page has a parent. Card and section context goes in a `meta-line` under its title, never above it.
- Segmented controls (filters, signup role) mark the selected option with a 2px `#47a62f` edge on the `#f2fbef` tint and ink text; white text on the greens fails AA at control sizes.
- Empty states sit where the list would be: a 40px `#47a62f` line icon (no grey circle), a 20/24 title, 16/24 ink body, and at most one action.
- Status styling uses one semantic icon or text label. Do not inject decorative dots beside an existing icon, and reserve warning/success color for real state.
- Liber's production light-green palette and assignments are authoritative: `#67c94f`, `#5fbe43`, and `#47a62f`, with `#f2fbef`, `#e0f6d8`, and `#bceaad` for tints and decorative lines. Primary controls use `#5fbe43` with white foregrounds and deepen to `#47a62f`; public search and map signals use `#47a62f` with white foregrounds and the production muted-green halos. Do not add substitute green tokens that change this treatment.
- Demand visuals may reuse the abstract atlas grammar inside maps only. Canonical service-area geometry remains the only source for real selected boundaries. Explain trust in one line near the upload or badge, not with a decorative step diagram.
- Log in, signup, and email verification use Zillow's split sign-in page (`components/auth-shell.tsx`), measured from Zillow's 2026 page: a 480px white form panel with a 320px column centred vertically (logo, 24/32 title, 14/700 labels, white 48px inputs with a `#a7a6ab` edge and 8px radius, 16px gaps, a full-width 48px primary button that stays pale until there is input, then the "New to Liber? Create account" line) beside a full-height art panel (Liber's own illustration and skyline on the artwork's ground colour). The site header and footer are hidden on these pages; below 900px only the form shows. Log in is email first, then password with a Show toggle. Auth notices use the inline-alert pattern.
- On narrow screens the homepage may stack and scroll, but the map, preview cards, and mobile navigation actions must all remain reachable.
- Do not use real-looking buyer imagery as a trust shortcut.
- Avatars are initials avatars (`components/generated-avatar.tsx`): one or two letters (first letters of the first and last words; one glyph for caseless scripts) in white Open Sans 600, about 40% of the diameter up to 48px and easing to 35% at 160px, on one of eight `--avatar-color-N` backgrounds (Pine, Lagoon, Harbor, Iris, Plum, Rosewood, Terracotta, Moss; 5.5–7.5:1 with white). Sizes: 36px header trigger, 40px list rows, 44px card overlay with a 2px white ring, 72px summaries, 96px profile header, 160px buyer-page hero. Avatars next to a visible name or inside a labelled control are `decorative` (hidden from assistive tech); colors carry no meaning. Buyer surfaces use the generated public alias; the header account trigger and `/profile` use the signed-in user's own account name, which only that user sees.
- Seller message-inbox rows use the authorized buyer's initials avatar; buyer-facing rows retain the generic message icon and receive no persisted seller avatar token.
- `npm run smoke:visual` covers public home/login/signup screenshots only. `VISUAL_SMOKE_BROWSER` accepts `chromium` or `firefox`; Windows defaults to Chromium then Firefox, while other platforms default to Firefox then Chromium. SwiftShader and the five-second virtual-time budget apply only to the Chromium path.
- Public preview cards pair the generated neutral buyer alias with that generated avatar, while profile links and invite actions remain exclusive to their existing server-authorized seller surfaces.
- `/negotiations/[negotiationId]` uses a sectioned task form, sticky deal
  snapshot, paginated immutable revision timeline, explicit current actor/state,
  separate review/submission action, and a mobile sticky action bar. Its modes
  are `CURRENT`, `HISTORICAL`, `EDITING`, and `REVIEWING`; historical mode shows
  its own summary and hides current-version actions. Draft errors preserve local
  input, visually mark/focus the exact field, and remain visible inside native
  decision dialogs. Unsaved or stale edits disable submission; the exact saved
  draft must be reviewed first. Every persisted term appears in review and
  decision dialogs, immutable versions are selectable, live financial preview
  is independent of unrelated text-field validity, and explicit term changes
  are separated from recalculated-value changes. Changes and status remain
  understandable without color.
- LOI copy must say "Submit LOI", "Submit counter", "Agree to terms for
  contract preparation", and "Terms aligned". Do not use sign, execute, accept
  offer, open escrow, or deposit-received language.

## Search-portal grammar

The UI follows the interaction grammar of the large listing portals, mapped onto
Liber's own features and palette. Keep new surfaces inside this system:

- Type and surfaces: Open Sans (variable, self-hosted through `next/font/local`)
  at 16/24 on `#2a2a33`, secondary text `#54545a`/`#596b82`, `#d1d1d5`
  hairlines, `#f6f6fa` inputs, a 4px control radius (8px for large cards and
  sheets), and three 30%-black elevations (`--shadow-card`, `--shadow-popover`,
  `--shadow-modal`). Focus is the two-ring `--focus-ring` box-shadow. Motion
  stays between 0.1s and 0.3s with `ease`.
- Hover styling lives inside `@media (hover: hover) and (pointer: fine)`.
  Buttons keep a 44px touch target through `.button::after` whatever their
  visual size.
- Search pages (`.search-page` on `/` and `/seller/search`): a toolbar with the
  location search, then filter popovers that edit a draft and commit on Apply.
  Filter pills follow Zillow's 2026 bar: 40px, 8px radius, a 1px `#7e7f8e`
  edge, bold label and chevron; an open or applied pill gets a 2px `#47a62f`
  edge on the `#f2fbef` tint. Dropdowns are 16px-radius panels with Zillow's
  48px grey title band (`#dddde1`, 14/700 `#54545a` title, Reset on the right),
  the fields, and one full-width 48px Apply. Budget uses a two-thumb range
  slider over Min / Max boxes; home type is a single-select radio list; trust
  badges are a 24px checkbox list.
  Below 1100px the popovers collapse into one Filters sheet, portaled to
  `document.body` so it covers the header. The map and results list sit side by
  side (list 750px, 390px below 1280px). Below 1007px the map stays sticky, the
  results slide over it as a sheet, and a floating List/Map pill jumps between
  them. Search pages use the compact footer; other pages use the full footer.
- Location search dropdowns (`.service-area-suggestions`) follow Zillow's
  autocomplete: a popover under the 40px input, one 52px row per place with a
  20px type icon (pin for neighborhoods, building for cities, `#` for ZIPs,
  clock for recent searches, map for "All of Los Angeles County"), the place
  name with the typed part in bold, and a grey `Kind · Parent, CA` line. The
  active row uses the `#e0f6d8` tint. Empty, loading, no-match, and "choose a
  specific area" states render inside the same popover.
- Listing cards (`.listing-card`): 12px radius, 177px media with at most two
  trust tags (Zillow's white photo tags with dark bold text) and the generated
  avatar, a 24/32 budget or price headline, `|`-separated facts ending in the
  home kind, a grey address line, and uppercase fine print. The whole card
  is one stretched link. `.listing-card.static` (seller properties, invite
  overview) drops the stretched link and adds a bottom actions row.
- Map pins are buyer-budget pills, not property prices. A pin pops when it is
  hovered or focused, or when its card is hovered. Overlapping labels collapse
  to dots instead of clustering. Hovering or clicking a pin opens one shared
  mini-card popup. Public homepage pins stay unlabeled dots.
- `/buyers/[buyerProfileId]` uses a home-details layout: sticky action bar,
  media collage (property-type artwork, generated avatar, approximate area
  tile), budget headline with stat dividers, glance tiles, divided sections, a
  sticky contact rail at 900px and wider, and a sticky bottom CTA below 900px.
  The invite disclaimer sits directly under Send invite in the rail.
- `/login`, `/signup`, and `/signup/verify` use the split sign-in page.
- Known gap: white text measures about 2.4:1 on `#5fbe43` and about 3.1:1 on
  `#47a62f`, below WCAG AA for 16px text. The palette above is mandated, so
  changing it needs an explicit brand decision.

## Agent notes

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.
