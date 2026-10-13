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
- Avoid essay callout cards (`card cream` + amber eyebrow + long privacy/
  legal paragraphs, or stacked `auth-alert info` walls). Put one short line in
  the page title, field hint, empty state, or submit checkbox instead. Keep
  real error/success alerts brief.
- Keep mobile and keyboard accessibility in scope.
- Primary mobile navigation must remain usable during delayed or missing client hydration; keep menu contents/actions in the DOM and preserve the fallback behavior in `primary-nav.tsx`.
- Primary navigation remains visible on the desktop map-first homepage. Guests get Demand map, For buyers, and For sellers; authenticated links use distinct buyer/seller action labels so dual-role accounts do not receive ambiguous duplicate links.
- Authenticated desktop navigation uses the user's generated avatar as the account-menu trigger. The menu contains only `Your profile` and the POST-only `Sign out` action; mobile navigation exposes the same two account actions when the desktop trigger is hidden.
- `/profile` is owner-only account identity. It may display the current session user's private name/email and workspace links, but those fields never become seller/public buyer identity.
- Workspace context belongs in descriptive page eyebrows and navigation, not decorative Buyer mode / Seller mode pills.
- Status styling uses one semantic icon or text label. Do not inject decorative dots beside an existing icon, and reserve warning/success color for real state.
- Liber's production light-green palette and assignments are authoritative: `#67c94f`, `#5fbe43`, and `#47a62f`, with `#f2fbef`, `#e0f6d8`, and `#bceaad` for tints and decorative lines. Primary controls use `#5fbe43` with white foregrounds and deepen to `#47a62f`; public search and map signals use `#47a62f` with white foregrounds and the production muted-green halos. Do not add substitute green tokens that change this treatment.
- Demand visuals may reuse the abstract atlas grammar inside maps only. Canonical service-area geometry remains the only source for real selected boundaries. Trust explanations may reuse the focused private-evidence -> Liber-review -> visible-badge flow; do not roll a decorative illustration template across unrelated empty states.
- Focused entry pages use one original illustration, one short explanation, and one obvious primary action. Signup uses two presentation steps with a labeled Role → Account stepper; step 1 is role cards with one-line outcome microcopy (no stacked hero art), and step 2 carries the hero illustration plus account fields. Role-prefilled buyer and seller links keep the role selected while still opening at Step 1.
- On narrow screens the homepage may stack and scroll, but the map, preview cards, and mobile navigation actions must all remain reachable.
- Do not use real-looking buyer imagery as a trust shortcut.
- Buyer avatar UI uses generated 2D animal avatars from the app-approved `avatarka` animals theme. The SVG is generated locally from an allowlisted token and rendered as a data image.
- Seller message-inbox rows use the authorized buyer's generated animal avatar; buyer-facing rows retain the generic message icon and receive no persisted seller avatar token.
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
  Below 1100px the popovers collapse into one Filters sheet, portaled to
  `document.body` so it covers the header. The map and results list sit side by
  side (list 750px, 390px below 1280px). Below 1007px the map stays sticky, the
  results slide over it as a sheet, and a floating List/Map pill jumps between
  them. Search pages use the compact footer; other pages use the full footer.
- Listing cards (`.listing-card`): 177px media with at most two trust flags and
  the generated avatar, a budget or price headline, `|`-separated facts ending
  in the home kind, an address line, and uppercase fine print. The whole card
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
- `/login` uses the sign-in dialog layout: Log in / New account tabs and a
  full-width Continue button.
- Known gap: white text measures about 2.4:1 on `#5fbe43` and about 3.1:1 on
  `#47a62f`, below WCAG AA for 16px text. The palette above is mandated, so
  changing it needs an explicit brand decision.

## Agent notes

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.
