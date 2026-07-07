# Section: UI Design System

## Purpose

Owns shared visual language, navigation, layouts, reusable components, and global CSS.

## Main files

- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/components/primary-nav.tsx`
- `apps/web/components/page-title.tsx`
- `apps/web/components/empty-state.tsx`
- `apps/web/components/icon.tsx`
- `apps/web/components/mode-chip.tsx`
- `apps/web/components/stat.tsx`

## Invariants

- UI must not be the only security control.
- CTAs should describe the actual action.
- Avoid fake/dead controls.
- Keep mobile and keyboard accessibility in scope.
- Primary mobile navigation must remain usable during delayed or missing client hydration; keep menu contents/actions in the DOM and preserve the fallback behavior in `primary-nav.tsx`.
- Do not use real-looking buyer imagery as a trust shortcut.
- Buyer avatar UI uses Boring Avatars generated art from app-approved package variants.

## Agent notes

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.
