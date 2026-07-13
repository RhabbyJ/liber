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

## Invariants

- UI must not be the only security control.
- CTAs should describe the actual action.
- Focused task-entry pages may use generous open-canvas spacing and a single high-emphasis input composition. Artwork must be original and brand-specific; visual references may guide hierarchy and proportions but not copied assets, brand colors, or product claims.
- Avoid fake/dead controls.
- Keep mobile and keyboard accessibility in scope.
- Primary mobile navigation must remain usable during delayed or missing client hydration; keep menu contents/actions in the DOM and preserve the fallback behavior in `primary-nav.tsx`.
- Primary navigation remains visible on the desktop map-first homepage. Guests get Demand map, For buyers, and For sellers; authenticated links use distinct buyer/seller action labels so dual-role accounts do not receive ambiguous duplicate links.
- Authenticated desktop navigation uses the user's generated avatar as the account-menu trigger. The menu contains only `Your profile` and the POST-only `Sign out` action; mobile navigation exposes the same two account actions when the desktop trigger is hidden.
- `/profile` is owner-only account identity. It may display the current session user's private name/email and workspace links, but those fields never become seller/public buyer identity.
- Workspace context belongs in descriptive page eyebrows and navigation, not decorative Buyer mode / Seller mode pills.
- Status styling uses one semantic icon or text label. Do not inject decorative dots beside an existing icon, and reserve warning/success color for real state.
- Role-prefilled buyer and seller signup links keep the role selected but still open at Step 1 so the user confirms intent.
- On narrow screens the homepage may stack and scroll, but the map, preview cards, and mobile navigation actions must all remain reachable.
- Do not use real-looking buyer imagery as a trust shortcut.
- Buyer avatar UI uses generated 2D animal avatars from the app-approved `avatarka` animals theme. The SVG is generated locally from an allowlisted token and rendered as a data image.

## Agent notes

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.
