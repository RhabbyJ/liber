# Liber Product V1 Definition

This is the strict production scope for Liber v1.

If a proposed feature conflicts with this file, do not implement it as production behavior without explicit product-owner approval and an update to this document.

## One-sentence product

Liber v1 is a private, searchable directory of verified real-estate buyer demand. Sellers search buyers, review fit, create private property records, send manual invites, and continue eligible outreach in one invite-scoped guided conversation.

## V1 success loop

```txt
Buyer signs up
-> Buyer creates a profile
-> Buyer adds property criteria
-> Buyer submits verification evidence for trust badges
-> Seller signs up
-> Seller receives approved seller-directory access
-> Seller searches buyer demand
-> Seller reviews buyer profile
-> Seller creates/selects a private property
-> Seller sends a manual invite
-> Buyer receives in-app notification and email
-> Buyer and seller may continue in one invite-scoped guided conversation
```

The loop is successful when a seller can find a relevant buyer and send a compliant manual invite without exposing private documents or creating a transaction.

## V1 public preview rules

Liber v1 includes a limited pre-signup preview of buyer demand to make the marketplace value obvious before account creation.

Liber has one buyer-demand map, at `/`, for every audience (October 2026; `/seller/search` redirects there with its filters). Everyone gets the same map, location search, filters (budget, beds and baths, home type, buyer trust, square feet, condition, amenities) and sort. What changes by audience is the projection: approved sellers and admins see full seller-search results; everyone else sees privacy-safe preview cards and unlabeled pins built from the same filtered search. Hovering or keyboard-focusing a preview card highlights only its matching map pin. There is no separate marketing landing page.

The public or unauthenticated experience can:

- show a small fixed set of privacy-safe buyer preview records, currently up to 4, as map pins and preview cards,
- use active, non-hidden, non-suspended buyer demand records whose preview fields are approved or derived from preview-safe criteria,
- place pins only at the buyer's selected active service-area center, never at private addresses; group identical centers with a count and keep every matching buyer accessible in the popup,
- show coarse buyer-demand context in preview cards, such as broad geography, budget band, property type, size needs, room needs, amenities, condition preference, and display-safe trust signals,
- show condition only as Move-in ready, Mild fixer, or Fixer; omit unsupported
  condition text from both guest and signed-in preview responses,
- show the buyer's first name, last initial, account code, and locally generated initials avatar as limited public identity; never expose the full surname or photograph,
- let visitors select an active ZIP/city/neighborhood service area to pan the map, draw an approximate selected-area polygon, and apply the shared filters and sort; results stay capped at 4 preview cards with no paging,
- use the same limited name and account code across public buyer labels,
- invite the visitor to sign up or request seller access before viewing full search results or profiles.

The public or unauthenticated experience must not:

- expose full buyer profiles,
- expose exact buyer locations, precise pin coordinates, home addresses, private documents, lender documents, financial files, contact information, or storage paths,
- page past the 4-card teaser or receive anything beyond the preview projection, whatever filters are applied,
- expose real buyer profile URLs as public SEO/crawlable pages,
- allow unauthenticated users to message, invite, contact, save, export, or otherwise act on a buyer,
- use fake production buyers or fake trust signals outside the CEO demo / private preview data policy below,
- imply that previewed buyers are guaranteed to transact.

Limited pre-signup previews are product marketing and onboarding support. They are not seller search, and they do not replace approved seller-directory access.

After a server-validated sign-in, buyers, sellers awaiting or denied full-directory approval, and other signed-in accounts page through every otherwise eligible privacy-safe preview record on the same map, except their own buyer profile and anyone they have blocked or who has blocked them. Preview filtering, sort, block exclusion and cursors reuse the approved seller search query; only the projection differs, and it is the exact same preview DTO and approximate-pin rules as the public teaser. Signing in changes only preview count and paging: it does not grant buyer profile links, private identity or contact data, invite actions, or any field reserved for approved seller-directory access. Limited names, codes, and initials avatars are part of the public preview for every audience. Sellers whose directory access is pending, rejected, missing or suspended see that state above the results; suspended accounts keep the same preview any signed-in account sees and nothing more.

The map destination and map headings are labeled **Map**. Searching changes the viewport and filters buyers; it never moves a buyer's pin to a different ZIP/city center. Static fallbacks use geographic street maps or show an unavailable state with usable buyer cards.

The map-first homepage keeps primary navigation visible, gives guests clear buyer/seller entry points, and gives signed-in users a next step matching their existing role. This orientation must not add public profile access or expand the preview contract.

## V1 launch geography

The approved v1 launch market is Los Angeles County, California (County GEOID `06037`). Liber supports deterministic selection across:

- all 88 incorporated cities;
- 304 County-associated 2020 Census ZCTAs, labeled as approximate ZIP service areas rather than official USPS ZIP boundaries;
- all 269 County statistical communities as approximate neighborhoods: 139 City of Los Angeles communities (for example Granada Hills, Sherman Oaks, Van Nuys), 10 Long Beach communities, and 120 unincorporated communities (for example Altadena and East Los Angeles).

Encino, Northridge, and Tarzana were the reviewed pilot communities. The remaining 266 became selectable on 2026-10-13 through the guarded community release (`la-county-06037-2026-07-12-v2-communities-2026-10-13`), which can be rolled back while no published buyer depends on them. Liber does not infer ZIP-to-city or ZIP-to-neighborhood membership at runtime; only explicit reviewed relationships may broaden a seller search. Searching a city still includes its reviewed communities, so a City of Los Angeles search includes buyers who chose Granada Hills.

Area search accepts any word of a name ("hills"), common spacing and abbreviation variants ("silver lake", "mount washington"), state suffixes ("Granada Hills, CA"), accents ("La Cañada"), a short reviewed nickname list (for example NoHo, WeHo, DTLA), and small typos. Only exact reviewed names auto-select an area; looser matches are suggestions the person must choose.

Interactive Mapbox maps may pan and zoom throughout the County bounds, but they do not show ambient County, city, or ZCTA borders. Selecting a supported ZIP, city, or neighborhood draws only that canonical service-area polygon and scopes the same privacy-safe or seller-authorized result set. Clearing the selection removes the polygon.

## Demo and production data policy

The current shared Vercel deployment may be treated as a CEO demo / private preview environment while access is intentionally limited and the product is not publicly launched. In that environment, agents may seed clearly marked test buyer demand so the map, preview cards, search, and invite flows can be demonstrated.

Demo/test buyer data must:

- use obvious non-real names, emails, and labels such as `Liber Demo Buyer` or `@example.test`,
- be seeded only through an explicit test/demo seed command or script, or created through the normal browser flow for the explicitly designated closed journey fixture below,
- be safe to delete and recreate,
- avoid real private documents, real financial documents, real IDs, real lender documents, and real contact information,
- use approximate active service-area locations only,
- keep any trust/badge labels clearly demo-safe unless backed by real reviewed evidence,
- be removed or replaced before a true public production launch.

Demo/test buyer data must not:

- pretend to be real production buyers,
- include fake production reviews, fake production transactions, or fake legal/financial claims,
- be mixed into a real public launch without an explicit cleanup/review step.

When the product moves from CEO demo / private preview to true production launch, fake buyers and fake trust signals are no longer allowed.

The controlled CEO demo / private preview may also enable an authenticated
`/preview-tools` surface for trusted workflow testing. It requires both
server-only values `LIBER_CEO_PREVIEW_TARGET=ceo-preview` and
`LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL=true`, in development/test or a Vercel
Preview deployment (`VERCEL_ENV=preview`). `VERCEL_ENV=production` always denies
these capabilities, even with stale preview flags. In an allowed environment, every
active signed-in session automatically receives `ADMIN`, and every active
seller automatically receives non-suspended `SellerAccess.status = APPROVED`
(suspended access is never restored). `/preview-tools` remains available as a
manual fallback and status page for those same current-user-only elevations.
Both transitions are rate-limited when triggered manually, write distinct audit
events and notifications, act only on the signed-in account, and cannot restore
`SUSPENDED` seller access. They cannot act on another user, grant badges,
review documents, or moderate profiles without going through the real admin
pages after the role is present. True-production readiness rejects this
capability, any still-approved seller-access row that relies on its preview
audit marker, and any account that still carries a preview admin self-grant
audit marker with `ADMIN` present. The flag must be disabled and those rows
must receive a real admin review / role cleanup before public launch.

The approved September 25 synthetic journey uses only
`liber-demo-buyer-20260925-journey@example.com` and
`liber-demo-seller-20260925-journey@example.com`, created through normal signup.
The buyer is visibly labeled **Demo buyer**, without invented badge evidence or
seed events. While the same private-preview flags are enabled, an authenticated
admin may use the separate `/admin/documents` test controls to approve/revoke
the fixture seller's current, normally attested property for this journey.
This is explicitly **Test approval — ownership not verified**, permits invites
only to the fixture buyer, and creates a distinct version-bound audit event,
not a verification document, checklist, badge, or `PropertyVerificationDecision`.
Revocation restores the actual current evidence state; identity edits invalidate
the test approval. Property, invite, and chat views preserve truthful test labels.
These fixtures and active overrides must be removed or reviewed before public launch.

## V1 roles

Public document verification is temporarily unavailable until private malware
scanning is integrated. The server refuses confidential uploads, finalization,
admin review and signing outside controlled synthetic preview/testing; upload
controls explain the unavailability before file selection. This launch gate
does not change the intended buyer/seller evidence requirements or revoke
already issued Storage URLs. See `docs/engineering/SECURITY_HARDENING_2026-09-22.md`.

Signup asks for the account's buyer/seller intent exactly once. The user may
choose buyer, seller, or both. After Supabase creates the immutable Auth UUID,
the server persists only that allowlisted form choice to `User.roles` before
redirecting to email verification; the account still has no authenticated
session until verification succeeds. The verified callback reads the persisted
database roles and goes directly to the matching workspace. V1 has no second
post-signup role-selection page, and ADMIN remains impossible to self-assign.

Log in, account creation, and email confirmation use Zillow's split sign-in
page: a narrow form panel beside a full-height Liber illustration (form only on
phones), without the site header or footer. Log in asks for the email first and
then the password. Account creation is one short form: an inline buyer / seller
/ both choice with a one-line outcome for the selected role, then the full
name (the surname stays private), email, and password fields. A role-prefilled entry opens with that choice
selected.

After email verification, buyer onboarding clearly hands off from account setup to the single buyer-profile form. The handoff explains that the profile is the next setup stage and that private account details remain hidden; it does not repeat role selection.

### Buyer

A buyer can:

- create and edit a buyer profile,
- add property criteria,
- upload verification evidence,
- receive admin-reviewed badges,
- view seller invites,
- accept or decline interest in an invite,
- exchange guided or plain-text messages inside an eligible invite conversation,
- block the other participant and report a specific message,
- view notifications.

A buyer cannot:

- self-issue trust badges,
- view other buyers through the seller directory unless separately approved as a seller,
- see private seller ownership documents,
- cause an invite response to execute a transaction.

### Seller

A seller can:

- request seller-directory access,
- browse the privacy-safe, read-only buyer-demand preview while full-directory access is pending or rejected,
- create and edit private property records,
- upload property images and ownership evidence,
- search active buyer profiles only after seller access is approved,
- review buyer profiles only after seller access is approved,
- send manual invites from properties they own,
- exchange guided or plain-text messages inside eligible invite conversations,
- block the other participant and report a specific message,
- view sent invites and seller notifications.

A seller cannot:

- access buyer identities, full profiles, advanced filters, contact actions, or invite actions only by self-selecting the seller role,
- see private buyer verification documents,
- bypass invite limits,
- bulk spam buyers,
- create an offer, escrow instruction, closing instruction, or funds-transfer instruction through v1.

### Admin

An admin can:

- review users,
- approve/reject seller access,
- review verification documents,
- grant/revoke badges when evidence rules allow it,
- review properties/invites,
- review reported messages through an audited report queue,
- hide buyer profiles,
- suspend users,
- view audit logs.

Admin role assignment is not self-service.

Seller access reviews show their result beside the admin controls. Authenticated admins may review or moderate their own accounts under the same evidence and audit rules as other accounts. Repeating an existing approval is harmless. Directory approval does not replace the separate property ownership review required for invites.

The private-preview exception above may grant the current active tester ADMIN
and approve their non-suspended seller-directory access while both explicit
preview flags are active. Admin operations still use the real admin gates and
audit paths. These preview grants must be removed or reviewed before public launch.

The closed synthetic journey is a separate, explicitly gated exception. All
other admin actions retain their server authorization, validation, evidence
rules, and audit trail.

## V1 account identity and deletion rules

- The private `/profile` page may show the current active session user's own account name, email, generated avatar, and available workspace links. It must not expose those private account fields to other users or use them as seller-facing buyer identity.
- A Liber account is owned by its immutable Supabase Auth UUID, not by email.
- Signup and email changes must never transfer buyer data, seller approval,
  properties, documents, invites, or ADMIN role between UUIDs.
- An email tied to another application UUID is an account-recovery case. It
  must fail closed instead of creating or relinking a usable account.
- Customer-facing hard deletion is not available until session revocation,
  Storage cleanup, pending-email handling, evidence retention, and audit policy
  are complete. Until then, deletion requests remain suspended/tombstoned on
  the original UUID and raw Auth deletion is blocked.
- After an explicitly reviewed full purge, same-email registration creates a
  fresh UUID with no inherited roles, ownership, approval, or private access.

## V1 buyer profile rules

Buyer profiles are the marketplace asset.

Buyer setup uses a two-handle purchase-budget slider with the Zillow list-price scale: $0, $50k, then $25k steps to $500k, $50k to $1M, $100k to $2M, $250k to $5M and $1M to $10M. Required editable Min/Max boxes retain exact custom, decimal, zero and high saved budgets; slider indices are never submitted. New profiles remain blank until chosen. Moved handles cannot cross; reversed typed values show an inline hint. Down-payment and size controls retain their existing increments.

The target-area field displays matching active cities, neighborhoods, and ZIP areas while the buyer types. An explicit mouse or keyboard selection confirms the area immediately; free text alone never selects an area.

The full account name stays private. Seller/public buyer identity shows only the first name, last initial, stable account code, and initials avatar.

A searchable buyer profile may include:

- first name, last initial, and stable account code,
- locally generated initials avatar,
- purchase type: cash, conventional financing, or other,
- seeking property type: house, condo, townhouse, manufactured, or land,
- desired location text/city/state,
- budget range,
- down payment range,
- criteria records,
- active trust badges,
- rating/review count if supported by real eligible interactions.

A buyer profile may become or remain searchable only when it has exactly one primary, buyer-confirmed service-area selection in an active market. The server derives location display fields and approximate coordinates from that canonical service-area row. Clearing the selection, selecting an unsupported/out-of-market area, or deactivating its market keeps the profile out of seller search and public previews.

Buyer profile intent is purchase-only in v1. Rental/tenant demand is out of scope and must not be offered as a buyer signup or profile purpose.

A buyer profile must not expose:

- verification document files,
- raw private financial documents,
- government ID documents,
- lender document URLs,
- sensitive storage paths,
- or any data that has not been approved for seller-directory display.

Full buyer profiles are not public marketing pages. They are only for approved seller access, admins, and the owning buyer where appropriate. Homepage buyer previews may exist only as privacy-safe cards under the audience and field rules above.

## V1 seller search rules

Seller search is the core product surface.

Before full-directory approval, sellers see the signed-in preview projection on the shared map. That preview has no buyer routing IDs, full-profile links, private identities, contact actions, or invite actions and is not seller search authorization.

Seller search must:

- require approved seller-directory access,
- show only active buyer profiles,
- default approved sellers into a map-first buyer-demand workspace,
- use the same result set for list and map views,
- support location/geography filtering by Liber-supported service areas,
- scope geography by an explicit active market and canonical service-area selection,
- support structured property-fit filters,
- support active trust-badge filters,
- rate-limit abuse-prone usage,
- audit meaningful search/profile-view activity when available.

Seller search must not:

- expose private documents,
- expose hidden/suspended/draft buyer profiles,
- rely on UI-only authorization,
- provide filters that create avoidable Fair Housing risk,
- or imply that Liber guarantees financing or closing.

## V1 seller search UX direction

The approved seller's main product page should feel like a map-first buyer-demand search experience.

Before approval, the shared map shows the privacy-safe preview with the review state explained in one inline notice under the filter bar. It must distinguish pending, rejected, missing-review, and suspended states and must not imply that preview browsing enables contact or invites.

The map should:

- be the primary first-screen surface for approved sellers,
- show buyer demand as number-first pins or clusters, similar to real-estate map price pins but representing buyers, not listings,
- use labels such as buyer counts, clusters, or representative budget labels when they are clear and privacy-safe,
- make the selected geography obvious,
- keep a filter button/control available on or near the map,
- update the buyer cards/list from the same filtered result set,
- avoid exposing exact buyer home addresses or private document-derived details.

The seller search page should also show actionable buyer cards below or beside the map. Buyer cards should summarize the buyer's fit at a glance, including budget, desired property type, bed/bath or room needs, target size, location, approved trust badges, and key criteria where available.

Seller search filters should include the v1-safe criteria needed to find property fit:

- location/geography,
- property or house type,
- budget range,
- financing/trust status derived from approved profile data or badges, such as pre-approval reviewed, verified funds, cash buyer, financing, or all,
- size needs, including square footage where supported,
- bedroom/bathroom or room-count needs,
- amenity needs such as pool, parking, ADU, yard, or garage where supported by buyer criteria,
- condition preference such as fixer, mild fixer, or move-in ready where supported by buyer criteria,
- active trust badges.

Filters must remain property-fit and trust oriented. Do not add filters based on protected-class proxies or unnecessary personal characteristics.

The public/unauthenticated homepage is a map-first preview of at most four buyer-demand records (anonymized, unlabeled pins at approximate locations plus preview cards). A signed-in user may see all otherwise eligible privacy-safe previews except their own, and an eligible unapproved seller may see that same projection as a read-only list on the seller route. None of these preview audiences may receive full buyer search, pins tied to precise locations, full buyer profiles, routing IDs, contact actions, invite actions, or crawlable buyer-directory data. The fully searchable, filterable buyer-demand map remains an approved-seller workspace.

## V1 property rules

Seller property records are private invite context, not public listings.

A property may include:

- address/location,
- provider-enriched or auto-populated property facts when available,
- property type/subtype: house, condo, townhouse, manufactured, or land,
- property facts,
- price/asking context,
- description,
- property images,
- ownership verification status,
- ownership evidence documents for admin review.

A property must not be treated as a public MLS-style listing in v1.

The September 25 meeting update uses a condition dropdown and seller feature
checkboxes, including fireplace, pool, garage, parking, ADU, yard, single story,
and central air conditioning. Garage square footage is no longer requested or
shown. Historical stored values remain intact; saved custom conditions/features
remain editable. Condition and features appear only in authorized property and
invite views.

Property attestations, evidence, images, and invites apply only to the property identity version on which they were created. Changing identity-relevant address/provider/location data requires a new seller attestation and ownership review, withdraws active or accepted invites, and prevents prior images from appearing in the new invite context.

Seller property creation may start from an address lookup. When property facts are auto-populated, the seller must still confirm they own the property or are authorized to represent it before using that property for invites. Ownership/authority claims must not be accepted as a substitute for admin-reviewed ownership evidence where evidence is required.

Seller ownership verification requires private admin review of both:

- a government-issued photo ID matching the exact name on the title record, or the decision maker for an owning entity,
- a utility bill, tax bill, or mortgage bill matching the owner/entity name and property address.

Ownership approval is bound to the property's current identity version. Address or provider-identity changes increment that version, invalidate prior approval for new invites, and require a new structured admin decision. Only `READY_FOR_INVITES` properties with current approved evidence can back new invites.

The whiteboard notes include deeper owner/buyer verification flow ideas around proof of funds, lender connections, IDs, and multi-day verification. Those purple-board verification workflow details are not part of this immediate v1 UI update unless separately approved and specified.

## V1 invite rules

An invite is manual seller outreach.

Expected invite-send failures explain the problem and next step on the form,
preserving the selected property and manual-outreach confirmation. Sending an
existing active invite again does not create another invite: the seller is
directed to its authorized conversation or Sent invites. Ownership/access
approval, validation, and send-limit failures provide relevant recovery
guidance. Buyer unavailability never discloses a block. Unexpected failures
show a support reference when available instead of internal error details.

An invite can:

- reference one seller-owned property,
- include a server-versioned guided opening and optional short seller note,
- notify the buyer in-app,
- enqueue a transactional email,
- expire or be withdrawn,
- be accepted/declined as an interest signal.

Signed-in users see an unread count and a lit notification bell, including on
mobile. A new seller invite received while the buyer has the app open displays
a dismissible popup linking to their invites. Visible, online sessions check
for activity approximately every five seconds; existing invites do not replay
popups on page load. Dismissing a popup does not mark it read. The bell's
explicit **Mark all read** control acknowledges only the signed-in user's
notifications. Page loads, prefetches, and activity reads never acknowledge them.

Every notification is a link. Ownership reviews tell the seller exactly what
happened ("Property verified" once both documents are approved), and a buyer's
rejected document says so and points to a replacement upload. The bell dropdown lists the five newest and the
notifications page lists the full feed with All/Unread filters; each row opens
the related LOI, invites, verification, properties, map, or admin page and marks
only that notification read. Users without a buyer or seller workspace use
`/notifications`.

An invite must not:

- create an offer,
- create a counteroffer,
- create escrow,
- move money,
- reserve earnest money,
- bind the buyer or seller to terms,
- represent legal acceptance,
- or automate transaction execution.

Required invite disclaimer language should remain plain-English and close to the send/response actions:

> This is a manual invite only. It is not an offer, escrow instruction, funds custody, or automated transaction.

## Guided Messaging V1

Guided Messaging V1 is a constrained continuation of a valid manual property invite. It is not a general direct-message system.

### Entry and participants

- A conversation is created only by the server when an approved seller successfully creates a valid invite for a currently ownership-approved private property.
- Each invite has exactly one conversation with exactly two participants: the invite seller and the application user who owns the invited buyer profile.
- Public visitors, arbitrary user IDs, unapproved sellers, suspended users, and non-participants cannot create, list, join, read, or send in a conversation.
- Messaging availability is controlled by a server-side release flag and cohort. In
CEO demo / private preview and local development the cohort may be `*`, which
opens messaging for every eligible invite conversation. True production readiness
rejects `*`. UI visibility is never the authorization boundary.

### Permitted purpose and content

Messages may cover property questions, condition and features, private-viewing logistics, timing, purchase-readiness questions tied to the property, and requests for more information through approved Liber flows.

Liber provides versioned seller opening templates and buyer quick replies. The server owns the template catalog and stores the selected key, version, and rendered text snapshot. Participants may also send plain text up to 2,000 characters. Liber does not render HTML or Markdown and does not automatically make links clickable.

The seller invite form selects the private property and confirms manual outreach;
it uses the canonical private-viewing opening and continues in chat. The buyer's
invite card provides decline, a question of up to 500 normalized characters,
request a tour, and start LOI. Questions and tour replies activate the invite only
when the canonical message is inserted successfully. Conversation routing comes
from the buyer-owned invite on the server. Unavailable messaging leaves the
question unsent and preserves local input; decline remains available. LOI
creation failures are shown explicitly and can be retried from accepted invites.

A buyer's invite card shows the property's current asking price, beds, baths, square
feet, condition, features, and the seller's note for invited buyers, alongside the
private photos. Stale property identities show none of these.

An eligible buyer can start an LOI even when the seller supplied no asking price.
The initial Offer price is blank in that case; a positive proposed amount is
required before reviewing or submitting terms; private drafts can save without it. Existing invite snapshots are never
rewritten to invent a seller price.

The messaging interface works like a desktop messenger: the conversation list stays
beside the open chat (one pane at a time on phones), the property is pinned at the
top of every chat, bubbles group by sender and day, quick replies open from the
composer's + button, and Details exposes property context, LOI, mute, and block. A single
check means sent; it does not claim delivery/read status. Inbox search and
All/Unread/Active filters apply only to loaded authorized conversations.

Messages are not offers, counteroffers, contracts, legal acceptance, escrow instructions, payment directions, earnest-money custody, or automated transaction execution.

### Lifecycle

- `AWAITING_BUYER`: the invite has been delivered. The buyer may reply. The seller waits for that reply before chat continues.
- `ACTIVE`: the buyer has replied or accepted the invite. Both participants may send guided or plain-text messages.
- `READ_ONLY`: the invite was declined, expired, or withdrawn; the property identity changed; or an account or seller approval lost eligibility. Eligible active participants may read preserved history, but sending is disabled.
- `BLOCKED`: either participant blocked the other. Sending stops immediately, affected active invites close, and future invitations between the pair are prevented.

Accepted invites remain open for messaging even after their original response deadline. Effective expiry closes an unanswered invite even if scheduled maintenance has not yet persisted `EXPIRED`. A property identity change freezes the old conversation and must not expose the property's new identity or current-version images in that thread.

Blocking is permanent in V1 and returns a generic unavailable result to the other participant. Reporting targets a specific message, preserves restricted evidence, supports a reason and optional context, and does not require the reporter to keep receiving messages. Admin access to content is report-driven and audited; there is no unrestricted admin conversation browser.

The composer keeps a short property-only/no-sensitive-details reminder visible.
Conversation Details retains the full safety reminder:

> Keep messages about the property, viewing logistics, timing, and legitimate purchase-readiness questions. Do not ask about protected personal characteristics. This conversation is not an offer, contract, escrow instruction, or payment request.

### Messaging non-goals and launch gates

V1 does not include unsolicited or public DMs, additional participants, group chat, attachments, chat images, calls, voice messages, typing indicators, reactions, threads, mentions, editing, user hard-deletion, full-text search, link previews, end-to-end encryption claims, AI auto-punishment, offers, contracts, payments, escrow, or funds custody.

The September 25 meeting explicitly adds private tour scheduling inside an
eligible accepted-invite conversation. Either participant can propose a time;
the other participant must confirm it. A new proposal replaces the previous
time and requires confirmation again. Either party can cancel. Dates display
their time zone. Confirmed tours queue a reminder before the tour and a follow-up
after it, with links back to Liber rather than private property or message
content in email. Read-only, blocked, stale, muted, and ineligible delivery is
suppressed. The UI must distinguish saved tours from available email delivery;
reminders require a working scheduled outbox worker and email provider.
External calendar connections are not included.

## Separately gated LOI V1 expansion

The LOI workspace is an explicitly approved V2 offer-preparation initiative and
does not change the core V1 marketplace boundary. It may run only behind
`LIBER_LOI_V1_ENABLED` and an explicit cohort. In CEO demo / private preview and
local development the cohort may be `*`, which means any eligible accepted-invite
participant pair can open the workspace. True production readiness still requires
exactly two unique reviewed UUIDs. It is a
non-binding, invite-linked term-alignment workspace for contract preparation,
not an offer-execution, signature, escrow, payment, or funds-custody product.

One accepted invite may have one LOI negotiation. The buyer alone creates and
submits revision one. The negotiation's buyer and seller bindings are immutable;
a later buyer-profile reassignment does not transfer LOI access. Private drafts
are visible only to their owner; submitted revisions are immutable; counters
alternate strictly; and only the counterparty to the current unexpired revision
may align, decline, or counter. "Terms aligned" records alignment on one exact
revision for later formal document preparation. It does not create legal
acceptance, open escrow, appoint a provider, verify a deposit, or move money.

For a seller viewing revision one, the terms heading reads Offer from followed
by the buyer legal/entity name already shared in that submitted LOI. Version,
author role, and submission time remain in the details. Unsubmitted drafts
remain owner-private.

Every submitted term must first be saved server-side and reviewed as the exact
saved draft. Unsaved or stale edits disable submission. The workspace has
progressive Draft → Review → Submit controls: Save and review persists the
private draft before opening its review; submission appears only there. Save
for later, reset/discard, and withdrawal are under More options, with explicit
confirmation before reset/discard. Draft conflicts keep local input and block
review until the latest saved draft is loaded.
More options also offers Save LOI template and Use saved template. Named
templates save reusable terms for the signed-in account in this browser;
they do not sync across devices. Applying a template preserves the current
buyer and agent identity, property binding, price, deposit, funding, and seller
disclosures. Counter templates respect the existing locked terms. Applied
terms are unsaved edits that must pass the normal save and exact-draft review
before submission. Users must review carried-over amounts for the new deal.
The calculator labels the buyer's remaining amount Expected cash to close.
Every draft edit updates the calculator immediately, including amounts typed
with `$` or commas. Conflicting amounts (for example a down payment above the
price) are flagged at the field and in the calculator instead of hiding it.
On phones the key total also stays visible in the bottom action bar.
It updates immediately from valid draft inputs, subtracting the deposit and
seller credits and adding the expenses allocated to the buyer. Unknown costs
remain excluded and marked incomplete; historical stored values stay unchanged.
After submitting an LOI or counter, the sender sees a primary Back to messages
button linking to that negotiation's conversation. It remains available after
the submitted negotiation closes.
Submission failures are shown beside the fixed action buttons. Financed review
explains the pre-approval requirement; a missing-evidence rejection links the buyer
to private letter upload and preserves the saved draft. An uploaded pending or
approved pre-approval letter qualifies without waiting for badge approval.
For the authorized Stone Door test, a server-configured exception may temporarily
skip only this evidence check for one exact buyer UUID and negotiation UUID until
an explicit UTC expiry. It grants no verification badge and is recorded in the
submission event; all other submission checks still apply.

The workspace has explicit current, historical, editing, and reviewing modes; historical views
hide current-version mutations. The editor, submission review, decision dialog,
and immutable revision view expose every persisted term and keep explicit term
changes separate from recalculated values. Funding V1 is limited to cash,
financed, and structured seller financing; unstructured `OTHER` funding is
excluded. The visible Other financed loan option uses the existing financed
contract with a required loan description, lender details, and the same
pre-approval evidence gate. Agent license number and home-warranty special inclusions are part of
the persisted term set. When the buyer is represented, the LOI collects proposed
commission amount and who pays; these remain non-binding terms and do not invite
the agent into the workflow. New drafts lock earnest money at 3% of price, and escrow duration cannot
exceed 90 days. Historical revisions keep their stored values.

The buyer may withdraw before the first submission. After submission, only the
author of the current revision may withdraw before the counterparty responds.
Withdrawal is terminal and preserves the immutable revision history.

New revisions receive an automatic 48-hour response deadline from the locked
server submission time. Historical revisions retain their stored deadlines.
An expired revision cannot be drafted, submitted, aligned, declined, or
withdrawn. Loss of invite, participant, seller-access, property-identity,
property-approval, conversation, or block eligibility makes the read model
immediately read-only and is later persisted without overwriting a prior
terminal outcome.

The LOI expansion excludes electronic signatures, purchase-agreement
generation, payment/wire links, escrow instructions, lender integrations,
third-party participants, attachments, simultaneous editing, AI-written legal
clauses, and automatic legal/business-day deadline interpretation. New financed
submissions require an active pre-approval badge or an uploaded pre-approval
letter plus lender contact, with a recoverable upload instruction when missing.
New starter terms default escrow fees to each party paying its own; title copy
explains the proposed seller-paid owner's policy. Represented buyers enter
commission as a nonnegative dollar amount or percentage no greater than 100%.
Seller-financing term/amortization inputs use years and persist whole months.
New amortizing seller-financed terms require an amortization schedule; locked
historical funding remains readable and can be countered without alteration.
The draft displays the immutable property address. Explicit appraisal and
seller-credit choices reveal only the relevant follow-up fields. Noncustomary
closing costs require named transfer-tax and government-retrofit payers;
additional allocation notes are optional. Legacy HOA document-fee drafts prompt
for a supported payer instead of offering Each pays own.
On a seller-financed price counter, principal updates to price less the unchanged
down payment; funding details and buyer identity remain locked. Personal-property
items support comma-separated entry and common item suggestions.
Messages may link to the workspace but cannot contain
authoritative LOI terms or mutate LOI state.

The September 25 meeting approves an optional closing-cost estimate section.
Escrow uses the supplied $300 plus $1.75 per $1,000 per-side schedule. Title
and other fee estimates use received quotes. Dollar/percentage
commissions and buyer/seller fee allocations feed clearly labeled estimated
closing-cost and cash summaries. Unknown fees stay distinct from explicit zero;
shared LOI summaries exclude seller mortgage payoffs and prorations. New submitted revisions
store calculation version 4; historical version 1, 2 and 3 summaries are never recomputed.
Changing the escrow payer preserves the entered escrow estimate and charges it
to that party's estimated closing costs. Recommended customary allocation shows
Seller for city/county transfer taxes and government-required retrofit items;
participants can turn off the recommendation to choose different payers.
Escrow and title insurance have independent Buyer, Seller, or Each Own payer
choices. Title defaults to Seller on new drafts; its entered estimate follows
the payer in cash calculations. Title company selection stays fixed on counters,
while the title fee payer can be negotiated. Historical omitted payer fields and
stored summaries remain compatible.

Fee estimates are expanded by default. The live snapshot identifies the buyer
agent commission payer and shows numeric buyer/seller cash equations using the
displayed summary. All entered commission and fee allocations update these
equations immediately. Switching Each Own escrow fees to one payer combines quotes and scheduled
unquoted shares. Title still requires both quoted shares for a known total.

The seller has a private loan-payoff box and a live Net proceeds calculator.
It lists the seller's share of every fee, seller credits, and closing rent-back,
then subtracts the entered payoff from the displayed seller cash subtotal.
Buyer-paid fees show zero in that seller breakdown; blank fees remain unknown.
Net proceeds is the final line, can be negative, and requires an explicit payoff
(zero when no loan). Payoff input remains in memory for this negotiation,
resets on refresh, and is excluded from shared LOI terms, draft APIs, templates,
and storage. Historical summaries remain immutable; version one lacks a seller
cash subtotal and shows Not calculated. Version two retains its own fee scope;
any stored-total reconciliation is explicitly labelled.

Included home warranties use the entered maximum as a budget estimate for the
selected payer. Warranty choices are Buyer, Seller, and Other; Other requires
explicit buyer/seller shares within
that maximum. Transfer taxes, retrofit, HOA fees, and additional personal-property
charges have entered amounts that follow their selected payer; no rates are
inferred. Through-escrow rent-back is an entered total paid by the seller and
credited to the buyer at closing. Monthly rent-back is shown separately as a
future monthly amount. Other fees cover additional costs only; participants must
confirm they exclude separately calculated expenses when both are entered.

Only the seller may provide or change the death-on-property answer. A buyer's
initial draft awaits seller disclosure; buyer counters preserve the current
seller answer. Changing a disclosure requires a revised submission for the
other party to review. Historical unattributed answers are labeled accordingly.

After Terms aligned, both authorized participants can download a private PDF
of the exact aligned revision and its stored calculations. It includes all
submitted terms and remains explicitly non-binding, for contract preparation.
The PDF is generated on demand with no public storage URL or private draft
content. It is not a signed contract or closing statement.

The production implementation uses PostgreSQL as the source of truth. Private Supabase Realtime events contain identifiers only and are delivery hints; every browser refetches canonical authorized data through Liber's server and retains polling/focus recovery.

Guided Messaging V1 remains controlled-preview only until counsel approves the template and fair-housing moderation policy, counsel/product publishes a retention rule, credential-rotation evidence and repository/archive secret scans are complete, private Realtime authorization is proven, block/report operations are staffed, and the scheduled outbox worker is restored. The current 24-month closed-conversation retention idea is a proposal, not an approved deletion rule, so no automatic message deletion runs in V1.

## V1 badge and verification rules

Trust badges are admin-reviewed signals, not self-asserted claims.

Supported v1 evidence-backed badges:

- pre-approval reviewed,
- verified funds,
- verified identity,

Cash buyer is a derived seller-facing signal only when the buyer selected cash purchase type and has current verified-funds evidence. It is not granted independently.

Earnest-money deposited, completed transaction, and non-contingent badges are disabled in v1. Earnest-money and completed-transaction signals require evidence/platform history that v1 does not have; non-contingent remains a preference rather than a verified financial badge.

Financial/identity badges must be tied to approved evidence where the backend supports it.

Buyers choose a verification file and explicitly select **Submit for review**.
The badges page lists their submitted documents and current review status,
including pending review and rejection reasons; uploading does not grant a badge.
Admins first approve the document in Documents, then grant the matching badge
in Badges. Badge controls offer only compatible approved evidence and explain
missing evidence or expected review errors inline. Admin-only buyer cards show
the account name/email so reviewers can identify the correct profile.

Pre-approval badges expire after 90 days unless renewed by approved evidence/review.

## V1 privacy and compliance guardrails

- Private verification documents stay private.
- Ownership documents stay private.
- Buyer financial documents stay private.
- Seller access gates buyer directory visibility.
- Buyer profile pages are not public/crawlable directory pages.
- Display fields should favor property fit and trust signals over unnecessary personal characteristics.
- Avoid adding filters or ranking logic based on protected-class proxies.
- Do not state or imply that Liber is a lender, escrow holder, broker, legal advisor, or closing agent.

## Explicit v1 non-goals

Do not build these as production behavior in v1:

- true escrow,
- earnest-money custody by Liber,
- money movement,
- wallet/balance features,
- automated offers,
- automated counteroffers,
- automated acceptance,
- signed purchase contracts,
- closing/settlement workflow,
- lender API approval workflow,
- credit decisioning,
- paid subscriptions/upgrades,
- public marketplace listings,
- broad public buyer-profile pages,
- customer-facing admin analytics,
- fake reviews or fake production buyers outside approved CEO demo / private preview seeding,
- general-purpose or unsolicited direct messaging outside a valid invite conversation.

## Product-owner approval required

These require explicit product-owner approval before implementation:

- changing invite limits,
- changing seller access approval rules,
- making buyer profiles publicly crawlable,
- adding messaging beyond the approved invite-scoped Guided Messaging V1 workflow,
- adding payments or escrow-adjacent claims,
- adding lender integrations,
- adding subscriptions or paid visibility,
- expanding launch geography claims,
- changing trust-badge evidence requirements,
- changing legal/compliance language.


Completed LOIs remain accessible to both authorized participants as read-only final terms. Chat offers View completed LOI after Terms aligned. Completion closes any open editor/review state and hides draft, template-apply, submit, counter, and decision controls; historical revisions remain readable. Private seller payoff estimates remain separate from shared terms.


Once both parties align on the exact current revision, a Download PDF section appears at the end of the completed LOI for both authorized participants. The private export includes all final shared terms and their stored calculations, excludes drafts and private seller payoff input, and is unavailable before alignment or while viewing history. The server rechecks participant access and aligned status for every download; no public PDF URL or stored export is created.


The prominent buyer cash card shows Estimated total cash needed including the earnest-money deposit, with separate deposit and Expected cash to close (remaining balance) rows. Buyers who already paid the deposit use the remaining balance. Deposit is included once and credited once. Existing stored V2/V3 amounts, negative credits and incomplete-estimate messaging are preserved; V1 receives no invented closing total.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. DiceBear Initials (CC0) renders locally with @dicebear/core 10.7.0 and @dicebear/styles 10.6.0; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.

In the explicitly enabled CEO demo, Admin → Badges provides a self-only test pre-approval marker for an active admin with an existing buyer profile. The label is **Test pre-approval — not verified**. Adding it requires acknowledging the test, lasts 24 hours, and can be revoked. It is a display marker recorded in the admin audit log, never a real trust badge or verification document. It does not satisfy financing eligibility or affect verified-badge search filters, counts, or ranking. Real evidence requirements remain unchanged.

LOI layout, October 6, 2026: The right-hand deal snapshot keeps purchase price, loan amount, earnest money and Expected cash to close with deposit credit. Seller view retains a compact private loan payoff and Net proceeds calculator. Commissions, closing-cost estimates, warranty/itemized/rent-back rows, full equations and seller fee deductions move to a full-width Fees and calculation details section below the draft/review, before the completed PDF. A sidebar link jumps to the details. Both seller totals share one negotiation-scoped payoff value in workspace component memory; it stays out of shared terms, templates, storage and API payloads. Local edits update both sections; historical saved calculations, incomplete estimates, completed read-only behavior and final PDF placement are preserved. No financial formulas, server, schema, dependency or environment changes.

Buyer cash budget, October 6, 2026: The prominent LOI cash card shows Estimated total cash needed, including the earnest-money deposit. Separate rows show the deposit and Expected cash to close (remaining balance). The total equals the stored/local remaining closing balance plus the deposit exactly once. Buyers who already paid the deposit are told to use the remaining balance. This is a display change; stored calculation versions, negative modeled credits, estimate incompleteness and V1 unavailable totals remain unchanged. Fees remain below the draft, with the key cash figures on the right. No bank-balance data, new fields, financial formulas, server, schema, dependencies or environment changes.

Escrow calculator estimates, October 6, 2026: The bottom financial details explicitly show buyer and seller escrow fees using the existing payer allocation. Dollar estimate inputs are grouped under Escrow fee estimates; official percentages remain pending and no rates are prefilled. Buyer fees increase cash needed and seller fees reduce proceeds once through the existing closing-cost totals. Blank quotes display Not estimated; explicit zero remains valid. Historical V1 reports escrow unavailable without recalculating stored amounts. The compact cash card includes the deposit and entered closing fees; fees stay below the draft. No financial formula, shared terms, server, schema, dependency, migration or environment changes.

Party-specific LOI calculators, October 6, 2026: The authenticated negotiation viewer role selects the calculator in the sidebar, bottom financial details and decision summary. Buyer sees deposit, loan amount, total cash needed, remaining cash to close, their allocated fee shares and buyer cash equation. Seller sees purchase price, private loan payoff and final net proceeds, with only their fee deductions in bottom details; buyer deposit/down-payment/cash-to-close rows are absent from the seller calculator. Seller-financed principal remains relevant to seller proceeds. Buyer ledger displays each fee share (including escrow), unknown quotes as Not estimated, other-party charges as zero, and preserves frozen historical residuals. The redundant two-party escrow component is removed. Shared offer terms and the final PDF remain readable by both parties; this is a presentation change, not a new data-access boundary. All existing calculations, historical versions, private payoff state, fee inputs, official-rate-pending policy and completed immutability are retained. No server, schema, migration, environment or dependency changes.


Private LOI draft price, October 7, 2026: Offer price is optional while saving an owner-private draft, including a counter draft. An unset offer uses zero as an internal missing marker, renders blank, and has no financial preview. Price-dependent comparisons wait until an offer price is present; other existing draft validations remain enforced. Saved drafts reload through the draft-only decoder. Review and server submission require a positive offer price and retain all funding, credit, commission, eligibility and immutable-revision checks. No migration, shared data, dependency or environment changes.


Escrow fee schedule, October 7, 2026: New LOI calculations use version 4. Each side defaults to $300 plus $1.75 per $1,000 of the positive offer price, calculated proportionally and rounded half-up to cents independently for each side. At $1,000,000 the fee is $2,050 per side. Each Own allocates one fee to each party; Buyer or Seller allocates both fees to that party. Blank escrow estimates select the schedule; entered quotes override the allocated amount, including explicit zero for no charge. Other blank fees remain unknown. Price changes reprice automatic fees; a payer switch preserves quoted amounts and uses the scheduled amount for an unquoted share. Title quotes still need both shares to establish a combined total. Buyer escrow increases buyer closing cash; seller escrow reduces seller proceeds once. A blank offer price may still be saved privately, but cannot calculate escrow or be submitted. V4 stores the per-side scheduled fee and the actual allocated buyer/seller escrow amounts in the immutable summary; review, history and final PDF use those frozen amounts. V1/V2/V3 decoders and historical summaries are unchanged. No database migration, dependency or environment change. Rollback after a V4 revision exists must retain V4 decoding. Earlier fee-schedule-pending notes describe their dated releases and are superseded by this contract.


LA City transfer-tax estimates, October 7, 2026: Calculation version 5 adds an optional, explicit City of Los Angeles July 2026–June 2027 schedule. The default remains entered combined transfer-tax quotes; neither an LA mailing address nor the existing property snapshot establishes city jurisdiction. Selecting the schedule confirms the estimate is for a taxable full-price transfer inside city limits in this rate period. County base tax is $0.55 per $500 and city base tax is $2.25 per $500, each rounded up to the next increment, for consideration above $100. ULA is 4% of the entire offer price strictly above $5,400,000 and below $10,900,000; 5.5% of the entire price at or above $10,900,000. Exactly $5,400,000 has no ULA. The base-tax payer remains negotiable; ULA is always seller-paid and is included once in seller itemized costs and proceeds. LA rate mode ignores retained manual transfer-tax quotes; returning to quoted mode restores those inputs. Other cities, exemptions, special taxable values and other closing periods use a quote including any ULA. Exempt/not-applicable base taxes require quoted mode. Review shows the chosen schedule and county/city/ULA amounts; the fee ledger separates base transfer tax and seller ULA. V5 freezes the schedule, tax components and allocated totals; V1/V2/V3/V4 decoding and immutable summaries remain unchanged. Counteroffers may negotiate the schedule and price; omitted schedule from older clients retains the current revision's choice. Reusable templates cannot carry a city-jurisdiction assertion into another property. The terms JSON keeps schemaVersion 1 with an optional validated field; no database migration, environment or dependency change. After V5 revisions exist, rollback must retain V5 decoding.

Rate sources verified October 7, 2026: [Los Angeles Office of Finance — Real Property Transfer Tax and Measure ULA FAQ](https://finance.lacity.gov/faq/measure-ula), [Los Angeles County Recorder — Documentary Transfer Tax](https://www.lavote.gov/home/recorder/property-document-recording/documentary-transfer-taxes). These rates are estimates for the selected taxable-price assumption; Liber does not determine jurisdiction, exemptions or actual closing tax liability.
