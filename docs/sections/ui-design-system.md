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
- Do not use real-looking buyer imagery as a trust shortcut.

## Agent notes

Prefer simple CSS classes and existing components. Do not install a UI framework without explicit approval.
