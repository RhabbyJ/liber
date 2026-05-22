ritical — fix before any real users see this
These are bugs in shipped behavior or compliance violations.

1. The home page renders mock buyers in production
   apps/web/app/page.tsx imports mock-data.ts and always renders three hard-coded buyer cards on /. New visitors see fake people. Their links and IDs do not exist in the DB and will 404 if clicked. Fix: load real ACTIVE profiles via searchBuyers (limit 3, recently refreshed) or remove the section until you have seed data.

2. Buyer can undo an admin's hideBuyerProfile
   updateBuyerProfile / setBuyerProfileVisibility accept visibilityStatus from the buyer's form. So a buyer whose profile was admin-hidden can re-submit the profile form with visibilityStatus=ACTIVE and reappear in seller search. This is a moderation bypass (apps/web/server/contracts.ts ~621–685; apps/web/app/buyer/profile/page.tsx). Fix: make visibilityStatus server-controlled, allow only DRAFT↔ACTIVE transitions when not HIDDEN/SUSPENDED.

3. Forms throw on validation failure → users hit a generic 500
   Almost every server action (form-actions.ts, auth-actions.ts, contracts.ts) calls schema.parse() or throw new Error(...). There is no error.tsx anywhere under apps/web/app/. So an invalid budget, a missing field, or a duplicate email returns a Next.js error page instead of inline form errors. Real users will think the site is broken. Fix: introduce useFormState + { ok, errors } return shape OR redirect with a status query param; add segment-level error.tsx boundaries.

4. Signup flow does not handle "email already exists" correctly
   In auth-actions.ts:117–162, after supabase.auth.signUp returns, the code unconditionally calls persistUserRoles (Prisma upsert by id) and admin.auth.admin.updateUserById. But Supabase deliberately returns a fake user with a random id and empty identities[] for already-registered emails (anti-enumeration). With email unique on User, the Prisma upsert hits a unique-constraint failure, surfaces a raw error, and the user sees a 500 — also leaking that the email is taken. Fix: gate persistUserRoles on data.session || data.user.identities?.length > 0. Otherwise redirect to /signup/verify with a generic "check your email" message.

5. Build will fail on a clean Vercel deploy because prisma generate is not wired in
   vercel.json buildCommand is just npm run build. The Prisma client is generated to packages/db/src/generated which is .gitignored. So a fresh npm install does not produce a client; next build will fail to resolve @liber/db. Fix: change buildCommand to npm run db:generate && npm run build, or add a root postinstall: prisma generate.

6. prisma.config.ts does not use DIRECT_URL
   You documented DIRECT_URL in .env.example and the readiness script, but prisma.config.ts only points at DATABASE_URL. Migrations run against the pgbouncer pooler URL, which Supabase explicitly says will fail or behave oddly. Fix: configure two datasources or set prisma migrate to use DIRECT_URL.

7. No scheduler is wired for /api/maintenance/expire
   The endpoint exists, the SQL works, CRON_SECRET exists — but there is no Vercel cron, no Supabase pg_cron, and no Inngest. So expired invites and badges silently linger in ACTIVE/SENT forever in production. This is the marketplace-trust feature you wrote. Fix: add a crons block in vercel.json (POST with Authorization: Bearer ${CRON_SECRET}), or schedule via Supabase pg_cron. Also use crypto.timingSafeEqual instead of !== on the secret check.

8. Invite rate limits live only in the Postgres trigger, not in the app
   sendInvite in contracts.ts:973–1024 does not call the perfectly good assertInviteAllowed helper. It just inserts and lets the trigger throw. The trigger error message bubbles up as a raw exception and there is no graceful UI for "you hit your daily limit" / "this property is unverified, max 5/day". Also, if anyone ever runs Prisma migrations against a DB without that trigger or applies a migration that accidentally drops it, all rate limiting silently disappears. Fix: call assertInviteAllowed (DB-counting variant) before insert, then map trigger errors to friendly UI strings.

9. The header "My Account" button always sends users to /onboarding/role
   apps/web/app/layout.tsx:33–35. For a fully onboarded buyer/seller, clicking My Account dumps them into the role selector. Almost every signed-in user will hit this once and assume the app is broken. Fix: route to /buyer/profile, /seller/search, or a role-aware /account page; only fall back to /onboarding/role when roles are empty.

High — fix in the next sprint 10. Mobile navigation is fully broken
globals.css:1100–1128 hides the nav and the auth buttons below 980px, then draws a fake hamburger via ::after with no click handler. There is no mobile menu component. On a phone, signed-in users have no way to navigate anywhere. Fix: real client component drawer/sheet (@radix-ui/react-dialog or your own) bound to a button.

11. "Send Invite" CTA on public buyer profile is unauthenticated
    /buyers/[id] is public by design. The Send Invite link goes to /seller/invite/[id], which is gated by the seller layout, which redirects to /login — but does not carry a next param from this entry point. Anonymous visitors lose context. Fix: build the link with ?next=/seller/invite/[id]. Better: make the button a Link that conditionally points to login when not signed in.

12. safeInternalPath lets .. segments through
    apps/web/lib/redirect.ts blocks //, ://, \, but accepts /../admin. NextResponse.redirect(new URL("/../admin", request.url)) resolves against the current URL and can land on /admin. Combined with the redirect chains in login/callback, this is a small but real surface. Fix: reject any path containing .. segments after splitting on /, or normalize and re-validate.

13. authCallbackUrl builds the email confirmation link from the request Origin header
    auth-actions.ts:193–202 reads headers().get('origin') first and only falls back to NEXT_PUBLIC_SITE_URL. An attacker who can control the Origin header on a signup request can redirect the confirmation email to their domain (token theft / phishing) if the Supabase redirect allowlist isn't perfectly tight. Fix: always use NEXT_PUBLIC_SITE_URL for confirmation/reset emails. Never use request-controlled headers for outbound URLs.

14. Middleware-equivalent (proxy.ts) only matches /buyer, /seller, /admin
    That means Supabase SSR cookies are never refreshed on the public marketing pages, login, signup, or /buyers/[id]. Sessions silently expire while the user is browsing public pages, then they bounce when they try to enter a protected route. Also, the proxy only enforces "is authenticated", not the role, so a logged-in buyer can hit /admin/foo and the only thing stopping them is the layout. Fix: widen the matcher to ((?!\_next/static|\_next/image|favicon.ico).\*) and let proxy() refresh cookies on every request. Optionally enforce role at the proxy level for /admin.

15. Server actions leak Prisma / Supabase / Zod error strings to the client
    There is no error mapping layer. error.message from Prisma can include column names and constraint names; Zod errors include field paths; Supabase auth errors leak provider info. This is also bad for email enumeration on signup. Fix: a tiny safeAction(fn) wrapper that catches and converts to { ok: false, error: 'friendly message' } and logs the real error server-side.

16. Send Invite terms checkbox is pre-checked
    apps/web/app/seller/invite/[buyerProfileId]/page.tsx:99 uses defaultChecked. This defeats the purpose of the consent and is a compliance smell — it implies users agreed without action. Fix: unchecked default, validated server-side (already validated by z.literal(true), but UX must require explicit click).

17. /admin/reports is fixture HTML
    Despite admin being "operational only", apps/web/app/admin/reports/page.tsx:3–16 is hard-coded card UI with names like "Seller Fixture". For an admin user this is misleading. It also looks like the dashboard you cut. Fix: wire to a real moderation queue table or remove the route until implemented.

18. AdminAuditLog.actorUserId cascades on delete
    schema.prisma ~355–358. Deleting an admin user wipes their audit log entries. That's the opposite of an audit log's purpose. Fix: change to onDelete: SetNull and make actorUserId nullable, or store the actor id as a plain UUID column not bound by FK.

19. No invite deduplication
    Invite has no @@unique([sellerId, buyerProfileId, propertyId]). A seller can spam the same buyer with the same property (within their 5/25-per-24h limit, which counts globally not per-buyer). On the buyer side this looks like harassment. Fix: add a partial unique index limited to status IN ('SENT','VIEWED') so accept/decline/expire don't block re-invite later.

20. Legacy "trust the client storagePath" upload actions are still exported
    uploadBuyerAvatar, uploadPropertyImage, uploadOwnershipDocument accept a client-supplied storagePath and write DB rows / set User.avatarUrl to it without uploading bytes (contracts.ts:688–912). The newer \*File variants do the right thing. The old ones are ammo — somebody could call them with a path that points to another user's verification doc, and the DB would happily record it. Fix: delete or unexport the legacy variants; the file-based ones already do everything.

21. No app-level file size or content-sniff check
    uploadToStorage (contracts.ts:312–328) only checks size > 0 and trusts client-supplied file.type. Service role bypasses bucket size limits. A logged-in user can upload a 4 GB blob. Fix: per-bucket max bytes (5MB profile / 10MB property / 20MB doc), and verify content type from magic bytes for documents.

22. uploadToStorage prefers the service-role client
    This means all writes (buyer avatars, property images, verification docs) bypass storage RLS. The RLS policies are correct, but they're never exercised. Today this is fine because the app authorizes upstream — but every future "convenience" change becomes a potential RLS escape. Fix: use the user-scoped server client for owner uploads; reserve service role for admin operations and signed URLs.

23. The "Pre-approved" copy implies lender approval
    Buyer cards, search filters, and the badge dropdown say "Pre-approved" without "Admin verified" qualifier. AGENTS.md and Implementation.md §12 explicitly say no lender-approval claims unless admin-verified. This is a compliance attack surface (UDAAP, Fair Housing implications). Fix: rename the displayed string to "Admin-verified pre-approval" or add inline disclaimer text near the badge.

Medium — quality, performance, devex 24. getSessionUser() is called on every server-rendered request in the root layout
apps/web/app/layout.tsx:14 + session.ts:8 (await connection()). This forces dynamic rendering of the entire app and runs Supabase Auth + Prisma roundtrips on every page, including marketing. There's no React.cache() dedup, so the layout, page, and any contracts call hit the DB three times per request. Fix: wrap getSessionUser in cache(), and consider scoping the auth-aware UI to a smaller subtree so the marketing shell can stay static.

25. No CI / no lint
    No .github/workflows. Type errors, broken tests, and forbidden-string regressions ship.
    Root npm run lint runs --if-present and no package defines a lint script. There is no ESLint, no Prettier, no next/core-web-vitals config.
    implementation-audit.md claims lint passes — currently it cannot meaningfully run. Fix: add a GitHub Actions workflow: npm ci && db:generate && typecheck && test && build && smoke:no-auth-bypass && smoke:routes. Add eslint-config-next to apps/web.
26. respondToInvite has no status guard
    A buyer can re-respond to an ACCEPTED, DECLINED, or EXPIRED invite. The Prisma update doesn't filter by current status (contracts.ts:743–757). Fix: update where status IN ('SENT','VIEWED'), return a domain error if zero rows updated.

27. Notifications and audit are incomplete
    No notification on invite-sent to the seller (sellers have no inbox action at all today).
    No notification when a badge expires via cron.
    No notification when an invite expires.
    No audit-log entry when the cron expires badges.
    No "pre-approval near expiration" reminder (only a mock helper exists).
    listAuditLog strips the metadata JSON — the most useful column for forensics. Fix: add notification creation + audit log writes inside expireMarketplaceState; surface metadata in admin UI (redacted as needed).
28. Public buyer profile is missing required fields per Implementation.md §4
    No pre-approval expiration countdown UI (the BadgePill supports expiresInDays but the public page doesn't pass it).
    "Active badges" filter is not applied — pending/expired badges render too.
    The star rating is hard-coded ★★★★★ regardless of ratingAverage. Misleading; an a11y problem. Fix: filter status === 'active' && expiresAt > now, render dynamic stars, and surface expiresInDays on PRE_APPROVED.
29. getPublicBuyerProfile returns the buyer's userId
    This isn't email/PII, but it correlates the public buyer profile to the auth user id, which is also the storage path prefix for verification-documents/{userId}/.... If a path is ever leaked elsewhere, this id becomes a pivot. Fix: omit userId from the public DTO; expose only the BuyerProfile.id.

30. Database is missing CHECK constraints
    BuyerProfile.budgetMin <= budgetMax
    BuyerCriteria.priceMin <= priceMax, same for sqft/lot/cap/units/yearBuilt
    lat BETWEEN -90 AND 90, lng BETWEEN -180 AND 180
    VerificationDocument should require exactly one of buyerProfileId / propertyId (not zero, not both)
    Review.rating BETWEEN 1 AND 5 Today these live only in Zod. A direct SQL write or a future code path skips them.
31. Missing performance indexes for v1 queries
    Partial WHERE visibilityStatus='ACTIVE' index on BuyerProfile. Every seller search filters by it.
    BuyerProfile(lastRefreshedAt DESC) for the "recently active" sort.
    BuyerProfile(ratingAverage DESC) for the "highest rated" sort.
    Invite(sellerId, sentAt) for rate-limit count queries (the trigger does a 24-hour scan).
32. searchDbBuyerProfiles has a hard cap of 100, no pagination
    First-launch market may not need it. The day a city goes live with >100 active buyers, sellers silently miss results. Fix: cursor pagination; explicit "showing N of ?" count.

33. LIBER_AUTO_CONFIRM_SIGNUPS=true is in your local .env
    Gated by NODE_ENV !== 'production', so it can't trigger on Vercel. But there is no readiness check that fails if it's set in prod env. One day someone sets it on a preview deploy and signs up without a real email. Fix: add a hard check in readiness:production and refuse to start if it is set.

34. No timing-safe compare on CRON_SECRET
    api/maintenance/expire/route.ts:8 uses !==. With careful timing, secret length is leakable. Fix: crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)), equal-length pad if needed.

35. Documentation drift
    AUTH_TRIGGER_SECRET is documented in DEPLOYMENT.md and LOCAL_DEV.md but not read anywhere in code.
    POSTMARK_SERVER_TOKEN is in .env.example but unused.
    dobeforelaunch/auth_and_schema_audit.md claims the proxy uses JWT app_metadata.roles for RBAC — the actual code reads roles from the DB (User.roles). Confusing for the next reviewer.
    docs/engineering/implementation-audit.md claims lint/CI pass — currently a noop. Fix: prune or implement.
36. app_metadata.roles is written but never read for authorization
    persistUserRoles mirrors roles into the JWT (auth-actions.ts:63–67). The runtime code authorizes only from prisma.user.roles. So the JWT copy is dead weight that can drift and mislead a future contributor (or a future client-side check). Fix: stop writing it, or document that it is for display only.

37. Logout is a GET link
    apps/web/app/layout.tsx:36 is <a href="/logout">. Any image tag on a third-party page can sign out your users (logout-CSRF, low severity). Fix: a tiny POST form with the same styling; route handler accepts POST only.

38. /onboarding/role is reachable without auth
    The page renders for anyone, and chooseRole redirects to login on submit. Not a vulnerability — slightly confusing UX. Fix: server-side getSessionUser redirect to login at the page top.

39. Email is passed through redirect query strings
    /login?email=...&status=invalid-login, /signup/verify?email=.... Email values end up in browser history, server logs, and (potentially) referrer headers. Privacy/compliance concern. Fix: short-lived cookie or Server Action useFormState to pass the email back without putting it in the URL.

40. requireSessionRole allows ADMIN bypass; requireCurrentUser does not
    Layouts let an admin (with no BUYER/SELLER role) onto buyer/seller pages, but the server actions then refuse the mutation. The admin sees the page render and gets a 500 on submit (because actions throw). Fix: pick one model. Either admin gets full access (then add the bypass to requireCurrentUser) or admin is blocked from buyer/seller pages too.

41. No tests for the most security-critical code
    You have decent unit tests for validators, redirect safety, mapbox, mock-domain logic, email mock, and date math. You have no tests for:

searchDbBuyerProfiles and the recommended-score sort
sendInvite rate limit + DB trigger interaction
expireMarketplaceState and the /api/maintenance/expire route
The auth callback route
Storage upload size/type enforcement
respondToInvite status guard (which doesn't exist yet)
Negative money / invalid enum / oversize string Zod cases There is also no Playwright suite even though Implementation.md §observability-and-testing lists Playwright for core flows. 42. Seller search "Select all" and "All Filters" are dead UI
/seller/search checkboxes have no name and no handler; "All Filters" just submits the form. On Figma these are real interactions. Fix: implement bulk actions (rate-limited bulk invite is forbidden for unverified properties, but a "send invites to selected" gated by tier could be valuable later) or remove the controls until they work.

43. Buyer "category tabs" on the criteria form don't change the form
    They visually exist but the form has a hidden propertyCategory=HOME (apps/web/app/buyer/criteria/page.tsx). Selecting "Land" or "Commercial" does nothing; commercial-specific fields (cap rate, units) and land-specific fields (zoning) aren't conditionally surfaced. Fix: client component that swaps the visible field set on tab change.

Low — polish 44. @liber/config and @liber/ui are dead workspaces
@liber/config has no source. @liber/ui exports only cn() and is not imported anywhere in apps/web. They sit in transpilePackages and dependencies for no reason. Fix: delete or actually use them (@liber/config for shared ESLint/tsconfig, @liber/ui for shared primitives).

45. Review model exists in the schema but no app code touches it
    Yet the public profile shows a reviewCount and ratingAverage. Today these are read but never written. Either implement reviews per Phase 6 of the plan or note explicitly in the schema that they're aggregate fields populated externally.

46. Hard-coded demo defaults in seller property "new" form
    apps/web/app/seller/properties/new/page.tsx ships with "Northridge", "925000", etc. as defaults. After your demo-mode purge this is the last vestige. Fix: blank defaults; placeholders only.

47. Hard-coded ★★★★★ in buyer cards
    buyer-card.tsx always renders five stars regardless of rating. A buyer with a 2.0 rating still renders 5 visual stars. Misleading and inaccessible. Fix: render Math.round(ratingAverage) filled stars + aria-label="3 out of 5".

48. No error.tsx, loading.tsx, or not-found.tsx anywhere
    Today every server failure is a 500 page. Slow Prisma queries (seller search) show nothing. Fix: at minimum, root-level error.tsx, not-found.tsx, and a loading.tsx for /seller/search and /admin/\*.

49. No metadata on individual routes
    Only the root layout has metadata. The public buyer profile, login, signup, search — all inherit "Liber" / generic description. No OG tags either.

50. Accessibility quick wins
    No "skip to content" link.
    Notification bell has no aria-label and no href.
    Mobile hamburger has no role/label and no handler.
    Filter controls in seller search use aria-label only, no <label>.
    Heading order on public profile starts with h3 for "Bio" before any h1.
    Tables (admin invites/users/audit) have no <caption> and no scope attributes.
51. .next-dev.log, liber.zip, and liber-codebase.zip exist at the repo root
    They're gitignored / vercelignored, but they're 11 MB and 2 MB respectively sitting in your working tree.

What to do first (1-week list)
If I were sequencing this, here's the order I'd take:

#5 — fix Vercel build (prisma generate in buildCommand). Your prod deploy is currently brittle.
#1 + #3 — kill home-page mock data, add error.tsx so users stop seeing 500s on form mistakes.
#2 + #4 + #16 — close the visibility-bypass, the duplicate-email signup path, and the pre-checked terms box. These are correctness/compliance.
#7 — wire a Vercel cron (or pg_cron) to /api/maintenance/expire. Without it your invite/badge expiry never runs.
#9 + #10 — fix "My Account" and mobile nav. Two highest-impact UX bugs.
#8 + #26 — call assertInviteAllowed from sendInvite, add the status guard on respondToInvite, and convert thrown errors to user-friendly UI.
#13 + #12 — harden authCallbackUrl against Origin spoofing, harden safeInternalPath against ...
#15 — add the safeAction wrapper that catches/maps errors uniformly.
#25 — set up the GitHub Actions pipeline so the next regression doesn't ship.
Everything else can come behind that.
If you want, I can implement any of these — I'd recommend tackling #1–#6 as a single PR since they're the smallest blast-radius "kill the demo + fix the deploy + stop showing 500s" set, and #7–#10 as a follow-up.

New critical findings from the live database
N1. Migration tracking is out of sync — your next deploy will likely fail
Your repo has 5 migrations, but two different trackers disagree:

public.\_prisma_migrations (Prisma's tracker) records 4 applied: 20260519000000_initial, …\_tighten_property_image_storage_policy, …\_add_missing_foreign_key_indexes, …\_add_profile_photos_bucket.
Supabase's own migration tracker (supabase_migrations.schema_migrations) records 1: enforce_unique_buyer_badges (timestamp 20260520053549).
That means 20260520000004_enforce_unique_buyer_badges was applied via the Supabase MCP/CLI (apply_migration), not via Prisma. Prisma doesn't know that migration is already applied. The next time prisma migrate deploy runs in CI/Vercel, Prisma will try to re-apply it, hit a "constraint already exists" error, and the deploy will fail. The schema itself is correct — the constraint is in place — but the bookkeeping is broken.

Fix: insert a row into public.\_prisma_migrations matching 20260520000004_enforce_unique_buyer_badges (with the same checksum the file produces) so Prisma considers it applied. After that, only ever apply migrations through Prisma so the two trackers don't diverge again.

N2. \_prisma_migrations and spatial_ref_sys are writable by anyone with the anon key
Supabase's advisor flagged these as ERROR-level. I confirmed via SQL: anon and authenticated roles have full SELECT/INSERT/UPDATE/DELETE/TRUNCATE on both tables, RLS is off, and PostgREST is on by default. Your NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the anon key — it's in the browser bundle, public to the world.

So with that key alone an attacker can:

DELETE FROM \_prisma_migrations to pretend nothing's been migrated, then trigger a re-deploy that destroys schema state.
UPDATE \_prisma_migrations SET checksum = '…' to make Prisma think a migration succeeded that didn't.
Read your applied migration names + timestamps (information disclosure: tells them exactly which schema patches you've shipped).
TRUNCATE spatial_ref_sys and break every PostGIS query in the app.
This is the most serious unaddressed finding and was hidden behind the "documented Supabase advisor item" line in Implementation.md. The doc says "decide the safest production path with the DB owner". The right path is:

Either ENABLE ROW LEVEL SECURITY on both tables with NO policies (default deny) and REVOKE ALL ON public.\_prisma_migrations FROM anon, authenticated; and the same for spatial_ref_sys,
Or move PostGIS out of public entirely (the advisor's recommended fix), which also fixes finding N5 below.
N3. The full marketplace flow has never been exercised end-to-end in production
auth.users: 1 row. public.User: 1 row. BuyerProfile: 0. BuyerCriteria: 0. BuyerBadge: 0. SellerProperty: 0. Invite: 0. Notification: 0. AdminAuditLog: 0. storage.objects: 0.

So while signup → email confirm → login worked once for rjeg2065@gmail.com (you, presumably), the rest of the build has never actually written a row to the live DB. Buyer profile creation, criteria save, avatar upload, badge document upload, seller property creation, ownership document upload, invite send, and admin actions are all unverified against real Supabase. Several of the issues from my prior review (legacy storagePath upload paths, sendInvite raw-error UX, image upload size limits) might actually surface as crashes the moment a real user tries them.

Fix: Add a checklist to your QA pass that exercises every action against the staging Supabase project before launch. The data is small enough that you can verify each one by inspecting the rows afterwards.

New high-priority findings
N4. Supabase Auth: leaked-password protection is off
Advisor: auth_leaked_password_protection. Supabase can check submitted passwords against HaveIBeenPwned for free. Currently disabled. Fix: one toggle in the Supabase dashboard → Auth → Providers → Email → "Check passwords against HaveIBeenPwned". No code change.

N5. PostGIS in public exposes st_estimatedextent to anon
Advisor: anon_security_definer_function_executable. PostGIS installs three overloads of st_estimatedextent as SECURITY DEFINER C functions. Because PostGIS lives in public, those functions are reachable through PostgREST RPC by both anon and authenticated. Not a code-execution vulnerability today, but it's an unnecessary attack surface and is the symptom that proves PostGIS shouldn't be in public. Fix: the long-term fix is to move PostGIS to a dedicated extension schema (the extensions schema or a new one). Short-term mitigation is REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(...) FROM anon, authenticated.

N6. Storage policy gap: profile-photos has zero policies
The bucket is public-read (which is fine for object URLs), but it has no INSERT/UPDATE/DELETE policies at all. Today this is OK because the app uploads via the service-role client, which bypasses RLS. But:

If you ever switch to client-side avatar uploads, every authenticated user will be blocked.
More importantly: verification-documents has no DELETE policy either, so if a user wants to remove a sensitive document, the only way to delete it is via service role.
Fix: add owner-write policies on profile-photos ((storage.foldername(name))[1] = auth.uid()::text) and an owner-delete policy on verification-documents.

N7. Auth DB connections set to absolute (10), not percentage
Performance advisor flagged this. When you upsize the Supabase instance for production traffic, the Auth service won't scale up its DB connection allocation automatically. Logins/signups will bottleneck before anything else. Fix: Supabase dashboard → Settings → Database → Auth connection strategy → switch to percentage-based. Five-second fix.

New medium-priority findings
N8. pg_cron and pg_net are not installed
You have the option in your dependencies, but neither is enabled. So the Supabase-internal scheduling path mentioned in Implementation.md §5 and backend implementation plan.md §10 is not actually available. Your only path for the badge/invite expiry cron is external (Vercel cron POSTing to /api/maintenance/expire). My prior #7 stands; this just confirms you can't fall back to pg_cron without first enabling the extension.

N9. User.roles is nullable in the database
The User.roles column is \_UserRole NULL DEFAULT '{}'. The Prisma client always writes a value, and the trigger always inserts an empty array, so today it's never NULL. But because the column allows NULL, a hand-written SQL update or a future Prisma migration regression could set it to NULL — and getSessionUser() would then silently return null (which the layouts read as "logged out"). Authorization-critical column should be NOT NULL with DEFAULT '{}'::"UserRole"[].

N10. User_email_idx is redundant with User_email_key
The unique constraint on email already creates an index. The duplicate User_email_idx exists from the FK-index migration and just wastes memory + write performance. Drop it.

N11. All timestamps are timestamp without time zone
This is the Prisma default and a known footgun. Stored as a wallclock value with no offset. As long as everything writes UTC, fine — but if any future code uses NOW() without AT TIME ZONE 'UTC' or a client writes a local-time string, you'll silently drift. Consider migrating to timestamptz before launch.

N12. handle_update_user fires on every admin.updateUserById call
Your chooseRole and signupWithPassword write app_metadata.roles to Supabase (mirroring my prior #36). Every one of those writes triggers handle_update_user, which runs an UPDATE on public.User setting email/name/avatarUrl back to themselves. It's a wasted round-trip per role change. Combined with #36 (the JWT mirror is unused for authorization), the cleanest fix is to stop writing app_metadata.roles at all.

N13. 3 stale rows in auth.flow_state
Three abandoned PKCE/email flows from your debugging sessions. Supabase's GoTrue does eventually clean these, but it's worth knowing they accumulate. Not a security issue.

What the live inspection confirmed is actually correct
Worth noting because it shows the parts of the spec that landed properly:

All 5 migrations from the repo are reflected in the actual schema (tables, indexes, triggers, policies).
All 3 storage buckets exist with correct config: profile-photos (public, 5 MB, image/png|jpeg|webp), property-images (public, 10 MB, image/png|jpeg|webp), verification-documents (private, 20 MB, pdf+images). Bucket-level file size and MIME enforcement is in place — that partially mitigates my prior #21 (the app still won't show a friendly error, but Supabase will at least reject oversize uploads).
All 7 storage policies on storage.objects reference auth.uid() and User.roles correctly. The path-segment ownership checks for property-images and verification-documents are written correctly.
All 3 SECURITY DEFINER app functions live in app_private with locked search_path = ''. The handle_new_user trigger never reads roles from raw_user_meta_data (verified by reading the function body). The handle_update_user trigger never touches roles. Admin role cannot be self-assigned via signup metadata.
The enforce_invite_rules trigger source matches the spec: 5/25 per 24h, ownership check, suspended seller block, flagged-property block, active-buyer requirement.
All 11 app tables have RLS enabled. Default-deny is in effect through PostgREST despite the broad GRANT to anon/authenticated (RLS without policies = deny).
The single auth user successfully traveled the full signup → confirm → role-mirror path: auth.users.raw_app_meta_data.roles = ['BUYER'] matches public."User".roles = {BUYER}. The auth-sync trigger and the app's persistUserRoles are working in concert.
All required Prisma columns from Implementation.md §7 are present in the live schema.
PostGIS partial GiST indexes for BuyerProfile and SellerProperty exist and exclude null lat/lng.
Updated priority order
If you're folding these into the plan I gave last turn:

N1 first — fix migration drift before your next deploy. This is mechanical and 5 minutes.
N2 — close the anon-writable \_prisma_migrations / spatial_ref_sys hole. Either enable RLS+revoke privileges, or move PostGIS out of public.
#5 from prior list (prisma generate in build) + N1 together — your deploy pipeline isn't actually safe yet.
N4 + N7 — two dashboard toggles, big risk-reduction-per-second.
N3 — manually exercise the full v1 loop against staging before any real-user launch.
N5, N6, N9 — schema/policy hardening before launch.
The previously listed 51 issues continue from there.
I'd still be happy to implement any of these — N1 and N2 are particularly worth doing soon since the deploy time-bomb and the anon-write hole both exist in production right now.
