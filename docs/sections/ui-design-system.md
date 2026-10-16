# Section: UI Design System

LOI recommended customary costs keep the transfer-tax and government-retrofit
payer dropdowns visible, selected as Seller, and disabled while the recommendation
is checked. Turning it off enables overrides with Seller as the starting value.
Escrow estimate inputs follow the chosen payer without discarding the entered
total; each-own estimates stay explicit rather than automatically splitting fees.
Escrow and title insurance have separate payer selectors beside their provider
questions. Keep title's payer outside the counter-locked title-company fieldset
so the party can negotiate costs without changing the provider.

## Purpose

Owns shared visual language, navigation, layouts, reusable components, and global CSS.

## Main files

- `apps/web/app/globals.css`
- `apps/web/app/messages/messages.css`
- `apps/web/components/buyer-invite-card.tsx`
- `apps/web/app/buyer/invites/invites.css`
- `apps/web/app/layout.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/components/account-menu.tsx`
- `apps/web/components/primary-nav.tsx`
- `apps/web/components/primary-nav-items.ts`
- `apps/web/components/page-title.tsx`
- `apps/web/components/empty-state.tsx`
- `apps/web/components/icon.tsx`
- `apps/web/components/site-footer.tsx`
- `apps/web/components/filter-popover.tsx`
- `apps/web/components/search-view-toggle.tsx`
- `apps/web/components/sort-select.tsx`
- `apps/web/lib/listing-format.ts`
- `apps/web/app/fonts/open-sans-latin-wght-normal.woff2` (OFL license in `apps/web/app/fonts/OFL-open-sans.txt`)

## Invariants

- LOI template actions live in More options. Their native dialog uses an
  accessible name/description, initial field or template focus, Escape/cancel,
  trigger-focus restoration, and 48px phone controls. Applying returns focus
  to the draft heading. The dialog explains browser-only storage and preserves
  current deal identity; replacement and storage errors remain visible.

- UI must not be the only security control.
- Messaging is role-neutral under `/messages`. It must render content as inert
  text, preserve unsent text after recoverable errors, expose guided and
  plain-text paths, announce send/load errors accessibly, and clearly render
  read-only/blocked/offline states on mobile and desktop.
- CTAs should describe the actual action.
- The homepage primary action is role-aware: sellers (including seller/admins)
  see Send invite, buyers see Manage buyer profile, and other signed-in users see
  Your profile. Admin navigation remains available through its existing routes.
- Buyer invitation cards distinguish the privately shared property, ownership
  status, seller opening, deadline, and question/tour/LOI response choices. Keep
  recoverable errors inline and preserve the question text. Chat uses compact
  dated bubbles, a persistent composer, and expandable Details; do not infer
  presence or read receipts from sent messages.
- Focused task-entry pages may use generous open-canvas spacing and a single high-emphasis input composition. Imagery must be original to Liber; visual references may guide hierarchy and proportions but not copied assets, brand colors, or product claims.
- Listing media is photography, not clip art. `lib/property-photos.ts` holds original generated photographs of Los Angeles homes (no real address) per property type in `public/images/homes`; `PropertyTypeArtwork` picks one stably by seed (buyer, alias, or property id). They illustrate the kind of home, never a specific property or a buyer. A seller's own property surfaces (`PropertyCoverPhoto`) show their first uploaded photo for the current identity through `/api/property-images/[imageId]`, otherwise a sample photo labelled "Sample photo".
- Property-type pickers are Redfin-style line-icon tiles (`house`, `condo`, `townhouse`, `manufactured`, `land` icons) over one native radio each.
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
- The full footer uses Redfin's columns on `--surface-subtle`: For sellers, For buyers, and Liber at a 214px pitch (16/400 grey headings, 12/700 links on 34px rows; 14/700 on 40px rows on phones), a 12/16 legal column with the copyright line, then the skyline: single-weight grey (`#c4c4cb`) line art of LA homes, palms and a condo tower on one ground line, like Zillow's footer drawing (120px, 88px below 1024px, 64px on phones). Footer links only point at routes that resolve for the viewer: Messages follows the header nav (messaging flag plus a buyer or seller role), guests get Log in / Create an account, and signed-in users get Your profile. No terms, privacy, social, or app links exist for Liber, so none are shown.
- `/profile` is owner-only account identity. It may display the current session user's private name/email and workspace links, but those fields never become seller/public buyer identity.
- Page headers follow the listing portals: a plain H1 (32/40, 24/32 on phones), at most one short meta line under it, and actions on the right (`components/page-title.tsx`). Do not add uppercase eyebrows, kicker labels, subtitle paragraphs, or Buyer mode / Seller mode pills; workspace context comes from navigation and a `page-back` link where a page has a parent. Card and section context goes in a `meta-line` under its title, never above it.
- Segmented controls (filters, signup role) mark the selected option with a 2px `#47a62f` edge on the `#f2fbef` tint and ink text; white text on the greens fails AA at control sizes.
- Empty states sit where the list would be: a 40px `#47a62f` line icon (no grey circle), a 20/24 title, 16/24 ink body, and at most one action.
- Status styling uses one semantic icon or text label. Do not inject decorative dots beside an existing icon, and reserve warning/success color for real state.
- Liber's production light-green palette and assignments are authoritative: `#67c94f`, `#5fbe43`, and `#47a62f`, with `#f2fbef`, `#e0f6d8`, and `#bceaad` for tints and decorative lines. Primary controls use `#5fbe43` with near-black `#2a2a33` text (6:1) and deepen to `#47a62f` on hover and press (4.6:1); disabled green buttons switch to the `#bceaad` tint with `#54545a` text (5.5:1) rather than fading (owner decision, October 2026, matching the LOI workspace). Public search and map signals use `#47a62f` with white foregrounds and the production muted-green halos. Do not add substitute green tokens that change this treatment.
- Demand visuals may reuse the abstract atlas grammar inside maps only. Canonical service-area geometry remains the only source for real selected boundaries. Explain trust in one line near the upload or badge, not with a decorative step diagram.
- Log in, signup, email verification, and password reset (`/forgot-password`, `/reset-password`) use Zillow's split sign-in page (`components/auth-shell.tsx`), measured from Zillow's 2026 page: a 480px white form panel with a 320px column centred vertically (logo, 24/32 title, 14/700 labels, white 48px inputs with a `#a7a6ab` edge and 8px radius, 16px gaps, a full-width 48px primary button that stays pale until there is input, then the "New to Liber? Create account" line) beside a full-height photograph (`public/images/homes/auth-hero.webp`, cover-cropped, a short settle-in fade that reduced motion disables). The site header and footer are hidden on these pages; below 900px only the form shows. Log in is email first, then password with a Show toggle and a "Forgot password?" link under it. Auth notices use the inline-alert pattern.
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
- Chat keeps its eligible Start LOI / Open LOI action above the composer rather
  than inside collapsed Details. Use a green callout, a visible 48px button,
  full-width mobile placement, and a short non-binding proposal explanation.
- LOI drafting exposes one main next action: Save and review (or Review LOI
  for an already saved draft), then a separate Submit LOI/Submit counter action
  with Back to edit. More options reveals save-only, reset/discard, and withdraw;
  reset/discard requires a native confirmation dialog. Submitted history is
  collapsed while drafting/reviewing. The sticky action bar remains reachable
  on mobile, controls have at least 48px targets, keyboard focus is visible, and
  the primary buttons retain the brand green with dark text for contrast.
  After submission, the sender's primary action becomes Back to messages,
  linking directly to the same conversation; it also appears in the completed
  submitted state. Keep the header's conversation link labeled consistently.
- LOI drafting keeps the property address visible and uses explicit appraisal,
  seller-credit, and financing-treatment choices to reveal their follow-up
  fields. Custom closing costs ask for each named payer, with no inferred
  allocation from legacy notes.
- Commission inputs use Percent (%) / Dollar amount ($) selection buttons,
  followed by one decimal input with the selected unit displayed. Changing
  units clears the number instead of reinterpreting it. Saved values restore
  their original unit; blank optional estimates remain unknown and zero stays
  an explicit zero. Keep existing input IDs and percent/dollar string storage.

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
- The search page (`.search-page` on `/`, the one map; `/seller/search` redirects): a toolbar with the
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
- `/login`, `/signup`, `/signup/verify`, `/forgot-password`, and `/reset-password` use the split sign-in page. `/profile` adds a Password settings section (current and new password, Show toggles) below the workspace links.
- Header notifications are a 40px icon button with a red count badge and a 380px dropdown on the account menu's surface: title row with Mark all read, the five newest notifications as clickable rows (32px type icon, title, two-line body, relative time, unread tint and dot), and "See all notifications". The list scrolls past 520px.
- Sibling workspace pages share `WorkspaceTabs` (Redfin "My Redfin" tabs: 16px labels, 3px ink underline): Sent invites / Notifications for sellers, Received invites / Notifications for buyers. Admin pages share a persistent `AdminNav` built from the same tabs.
- Notification feeds (`NotificationList`) sit under an All/Unread segmented filter with a Mark all as read link. Each row is one link: 40px type icon, title (bold when unread, on a green tint with a dot), body, then relative time ("4m ago", "Yesterday", "Sep 25") · green action label ("Open LOI"); read rows end in a chevron. Sent invites are activity rows: avatar, buyer and status tag, property and ownership line, sent day, one action.
- `/seller/properties/[propertyId]/edit` is a listing editor: cover thumb, title and status, sticky section tabs (Home details, Photos, Ownership), white section cards, an unverified-ownership alert, and a sticky summary rail; the save bar sticks to the bottom on phones. `/seller/properties/new` opens with a photo banner whose address search overlaps its bottom edge.
- The invite composer is a white card: property choice cards (cover thumb, title, status, check), a "what the buyer receives" note, the manual-invite confirmation, and a full-width Send invite.
- The buyer detail media collage uses a listing photo and a real Mapbox street tile centred on the approximate area center (`mapboxAreaImageUrl`), never a drawn map.
- Known gap: buttons now carry near-black text, but white still sits on the
  greens for map budget pins (about 3.1:1 on `#47a62f`), count badges, and the
  checked-box tick, below WCAG AA. Changing those needs the same kind of brand
  decision.

- Buyer workspace: the profile wizard is one 720px column with Redfin segmented controls, the search filter's budget slider and toggle chips (native radios/checkboxes, unchanged names); verification shows per-badge status rows (test pre-approvals always read Not verified) above a shared drag-and-drop `DirectUploadField` zone; received invites are horizontal saved-homes cards grouped Awaiting your reply / Accepted / Closed. Invite cards without shared photos use the property type's photo labelled "Sample photo".
- Messages look like WhatsApp Web / iMessage for Mac: inbox list (pill search, All/Unread/Active chips, 52px avatars, green unread time and count) beside the thread; avatar header; pinned listing bar with LOI strip and tour bar; `--chat-bg` history with white incoming and `#d6f5c9` outgoing bubbles (ink text for AA), tails on the last bubble of a group, times inside bubbles; invite as a photo card; pill composer with `+` quick-reply tray and a round `#2f7d1f` send button. The site footer is hidden on messages pages.
- Status labels (`.status-tag`, `.status-dot`, `.message-status-chip`) are Zillow-style: an 8px colored dot (green active, `--status-pending` amber pending, red expired/declined, grey neutral) then 13px ink text, with no tinted pill background. Do not reintroduce tinted status pills.
- LOI workspace: checkout-style stepper, numbered white section cards, sticky deal snapshot, definition-grid reviews, modal decision sheets, and a white sticky action bar. Area rules live in `components/loi/loi-workspace.css` and `app/messages/messages.css`; older globals.css rules for these areas are overridden, not deleted, because the area sheets still rely on some of their base properties.

## Agent notes

The root page supplies a fresh CSP nonce to the native primary-navigation
fallback script. Any new inline script needs explicit nonce handling; do not
restore `unsafe-inline` in the script policy. Mapbox/React inline styles remain
allowed separately. Confidential upload fields support a disabled reason that
explains temporary verification unavailability before file selection.

Shared buyer response types live in `apps/web/lib/buyer-dtos.ts`; public
preview components use its `PublicBuyerPreviewDTO` without importing server code.

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.

LOI layout, October 6, 2026: The right-hand deal snapshot keeps purchase price, loan amount, earnest money and Expected cash to close with deposit credit. Seller view retains a compact private loan payoff and Net proceeds calculator. Commissions, closing-cost estimates, warranty/itemized/rent-back rows, full equations and seller fee deductions move to a full-width Fees and calculation details section below the draft/review, before the completed PDF. A sidebar link jumps to the details. Both seller totals share one negotiation-scoped payoff value in workspace component memory; it stays out of shared terms, templates, storage and API payloads. Local edits update both sections; historical saved calculations, incomplete estimates, completed read-only behavior and final PDF placement are preserved. No financial formulas, server, schema, dependency or environment changes.

Buyer cash budget, October 6, 2026: The prominent LOI cash card shows Estimated total cash needed, including the earnest-money deposit. Separate rows show the deposit and Expected cash to close (remaining balance). The total equals the stored/local remaining closing balance plus the deposit exactly once. Buyers who already paid the deposit are told to use the remaining balance. This is a display change; stored calculation versions, negative modeled credits, estimate incompleteness and V1 unavailable totals remain unchanged. Fees remain below the draft, with the key cash figures on the right. No bank-balance data, new fields, financial formulas, server, schema, dependencies or environment changes.

Escrow calculator estimates, October 6, 2026: The bottom financial details explicitly show buyer and seller escrow fees using the existing payer allocation. Dollar estimate inputs are grouped under Escrow fee estimates; official percentages remain pending and no rates are prefilled. Buyer fees increase cash needed and seller fees reduce proceeds once through the existing closing-cost totals. Blank quotes display Not estimated; explicit zero remains valid. Historical V1 reports escrow unavailable without recalculating stored amounts. The compact cash card includes the deposit and entered closing fees; fees stay below the draft. No financial formula, shared terms, server, schema, dependency, migration or environment changes.

Party-specific LOI calculators, October 6, 2026: The authenticated negotiation viewer role selects the calculator in the sidebar, bottom financial details and decision summary. Buyer sees deposit, loan amount, total cash needed, remaining cash to close, their allocated fee shares and buyer cash equation. Seller sees purchase price, private loan payoff and final net proceeds, with only their fee deductions in bottom details; buyer deposit/down-payment/cash-to-close rows are absent from the seller calculator. Seller-financed principal remains relevant to seller proceeds. Buyer ledger displays each fee share (including escrow), unknown quotes as Not estimated, other-party charges as zero, and preserves frozen historical residuals. The redundant two-party escrow component is removed. Shared offer terms and the final PDF remain readable by both parties; this is a presentation change, not a new data-access boundary. All existing calculations, historical versions, private payoff state, fee inputs, official-rate-pending policy and completed immutability are retained. No server, schema, migration, environment or dependency changes.
