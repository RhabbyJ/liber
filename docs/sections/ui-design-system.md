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
