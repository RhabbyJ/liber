# Architecture

Liber starts as a modular monolith.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres/Auth/Storage
- PostGIS for geography search
- Prisma for schema and migrations
- Zod for validation
- Resend or Postmark for transactional email

## Boundaries

- `apps/web`: app routes, screens, server actions, page-specific components
- `packages/db`: Prisma schema and database documentation
- `packages/validators`: shared Zod input contracts
- `packages/ui`: reusable UI primitives when needed
- `docs`: product and engineering contracts

## Data Access

Use server-side data access for sensitive operations. Supabase publishable keys may be used in browser-safe contexts only. Service role keys must never be exposed to client code.

Current backend state:

- Prisma migrations are applied to Supabase project `qfjcrhkjlczvzakxives`.
- Runtime/server actions use Prisma against Supabase Postgres for authenticated Supabase users only.
- Local fixture data is limited to public examples and unit tests; it cannot authenticate users or bypass protected routes.
- App tables currently have RLS enabled without browser-client policies; this keeps Data API access locked down until explicit owner/admin policies are designed.
- Public profile photos are stored in `profile-photos`; the public URL is persisted to `User.avatarUrl`.
- The broad public storage listing policy for `property-images` has been removed. Public media buckets remain public for object URL reads without enabling bucket listing.
- Buyer/seller roles are selected through server actions, stored in `User.roles`, and mirrored to Supabase app metadata when the service-role key is configured. Role-less Supabase users are sent through onboarding instead of receiving inferred buyer/seller access.
- Server-side file uploads validate ownership in Prisma, then use the server-only Supabase admin client to write Storage objects. This avoids leaking service keys while keeping app-table RLS locked down from browser clients.
- Private verification document previews are generated as short-lived signed URLs on internal admin routes.
- Seller search applies structured filters in Postgres, including buyer criteria property-fit fields for bedrooms, bathrooms, square feet, lot size, cap rate, and units. PostGIS handles radius filtering when a coordinate center is supplied. Mapbox should later provide user-friendly geocoding/autocomplete for those coordinates.

## Security

- RLS is required for tables exposed through Supabase APIs.
- Admin roles are server-controlled.
- User-editable metadata cannot drive authorization.
- Verification documents live in private storage.
- Sensitive reads should use signed URLs or server mediation.
- Auth sync trigger functions live in a private schema with locked `search_path`, not in `public`.
- Supabase Auth user IDs are UUIDs, and user foreign keys must stay UUID-compatible.
- Customer-facing navigation must not expose the designer-made admin analytics dashboard.

## Scaling Path

Keep the first build simple. Introduce external search, queues, or service splits only after real traffic shows where the pressure is.
