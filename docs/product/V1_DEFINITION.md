# Liber Product V1 Definition

This is the strict production scope for Liber v1.

If a proposed feature conflicts with this file, do not implement it as production behavior without explicit product-owner approval and an update to this document.

## One-sentence product

Liber v1 is a private, searchable directory of verified real-estate buyer demand. Sellers search buyers, review fit, create private property records, and send manual invites.

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
```

The loop is successful when a seller can find a relevant buyer and send a compliant manual invite without exposing private documents or creating a transaction.

## V1 public preview rules

Liber v1 includes a limited pre-signup preview of buyer demand to make the marketplace value obvious before account creation.

The public homepage is a map-first landing surface: a Zillow-style map showing anonymized buyer-demand pins labeled with budget bands instead of listing prices, plus a small set of matching preview cards and a signup wall. There is no separate marketing landing page.

The public or unauthenticated experience can:

- show a small fixed set of privacy-safe buyer preview records, currently up to 6, as map pins and preview cards,
- use active, non-hidden, non-suspended buyer demand records whose preview fields are approved or derived from preview-safe criteria,
- place pins only at approximate locations (pilot-area centers or similarly coarse coordinates with a display offset), never at precise buyer locations,
- show coarse buyer-demand context such as broad geography, budget band, property type, size needs, room needs, amenities, condition preference, and display-safe trust signals,
- use anonymized or privacy-safe buyer labels,
- invite the visitor to sign up or request seller access before viewing full search results or profiles.

The public or unauthenticated experience must not:

- expose full buyer profiles,
- expose exact buyer locations, precise pin coordinates, home addresses, private documents, lender documents, financial files, contact information, or storage paths,
- expose a fully searchable buyer directory or public search filters,
- expose real buyer profile URLs as public SEO/crawlable pages,
- allow unauthenticated users to message, invite, contact, save, export, or otherwise act on a buyer,
- use fake production buyers or fake trust signals outside the CEO demo / private preview data policy below,
- imply that previewed buyers are guaranteed to transact.

Limited pre-signup previews are product marketing and onboarding support. They are not seller search, and they do not replace approved seller-directory access.

## Demo and production data policy

The current shared Vercel deployment may be treated as a CEO demo / private preview environment while access is intentionally limited and the product is not publicly launched. In that environment, agents may seed clearly marked test buyer demand so the map, preview cards, search, and invite flows can be demonstrated.

Demo/test buyer data must:

- use obvious non-real names, emails, and labels such as `Liber Demo Buyer` or `@example.test`,
- be seeded only through an explicit test/demo seed command or script,
- be safe to delete and recreate,
- avoid real private documents, real financial documents, real IDs, real lender documents, and real contact information,
- use approximate pilot-area locations only,
- keep any trust/badge labels clearly demo-safe unless backed by real reviewed evidence,
- be removed or replaced before a true public production launch.

Demo/test buyer data must not:

- pretend to be real production buyers,
- include fake production reviews, fake production transactions, or fake legal/financial claims,
- be mixed into a real public launch without an explicit cleanup/review step.

When the product moves from CEO demo / private preview to true production launch, fake buyers and fake trust signals are no longer allowed.

## V1 roles

### Buyer

A buyer can:

- create and edit a buyer profile,
- add property criteria,
- upload verification evidence,
- receive admin-reviewed badges,
- view seller invites,
- accept or decline interest in an invite,
- view notifications.

A buyer cannot:

- self-issue trust badges,
- view other buyers through the seller directory unless separately approved as a seller,
- see private seller ownership documents,
- cause an invite response to execute a transaction.

### Seller

A seller can:

- request seller-directory access,
- create and edit private property records,
- upload property images and ownership evidence,
- search active buyer profiles only after seller access is approved,
- review buyer profiles only after seller access is approved,
- send manual invites from properties they own,
- view sent invites and seller notifications.

A seller cannot:

- browse buyers only by self-selecting the seller role,
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
- hide buyer profiles,
- suspend users,
- view audit logs.

Admin role assignment is not self-service.

## V1 buyer profile rules

Buyer profiles are the marketplace asset.

A searchable buyer profile may include:

- display name or privacy-safe display label,
- avatar/profile image when allowed by privacy policy,
- buyer type,
- buying purpose,
- desired location text/city/state,
- budget range,
- down payment range,
- criteria records,
- active trust badges,
- rating/review count if supported by real eligible interactions.

A buyer profile must not expose:

- verification document files,
- raw private financial documents,
- government ID documents,
- lender document URLs,
- sensitive storage paths,
- or any data that has not been approved for seller-directory display.

Full buyer profiles are not public marketing pages. They are only for approved seller access, admins, and the owning buyer where appropriate. Public buyer previews may exist only as limited, privacy-safe teaser cards under the public preview rules above.

## V1 seller search rules

Seller search is the core product surface.

Seller search must:

- require approved seller-directory access,
- show only active buyer profiles,
- default approved sellers into a map-first buyer-demand workspace,
- use the same result set for list and map views,
- support location/geography filtering,
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

The public/unauthenticated homepage is a map-first preview of limited buyer demand (anonymized budget-band pins at approximate locations plus preview cards), but must not expose full buyer search, pins tied to precise locations, full buyer profiles, or crawlable buyer-directory data. The fully searchable, filterable buyer-demand map remains an approved-seller workspace.

## V1 property rules

Seller property records are private invite context, not public listings.

A property may include:

- address/location,
- provider-enriched or auto-populated property facts when available,
- property subtype,
- property facts,
- price/asking context,
- description,
- property images,
- ownership verification status,
- ownership evidence documents for admin review.

A property must not be treated as a public MLS-style listing in v1.

Seller property creation may start from an address lookup. When property facts are auto-populated, the seller must still confirm they own the property or are authorized to represent it before using that property for invites. Ownership/authority claims must not be accepted as a substitute for admin-reviewed ownership evidence where evidence is required.

The whiteboard notes include deeper owner/buyer verification flow ideas around proof of funds, lender connections, IDs, and multi-day verification. Those purple-board verification workflow details are not part of this immediate v1 UI update unless separately approved and specified.

## V1 invite rules

An invite is manual seller outreach.

An invite can:

- reference one seller-owned property,
- include a seller-written message,
- notify the buyer in-app,
- enqueue a transactional email,
- expire or be withdrawn,
- be accepted/declined as an interest signal.

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

## V1 badge and verification rules

Trust badges are admin-reviewed signals, not self-asserted claims.

Supported v1 badge concepts:

- pre-approval reviewed,
- verified funds,
- cash buyer,
- non-contingent preference,
- verified identity,
- completed transaction when supported by real platform history,
- earnest-money evidence only if described as reviewed third-party evidence, not Liber-held funds.

Financial/identity badges must be tied to approved evidence where the backend supports it.

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
- fake reviews or fake production buyers outside approved CEO demo / private preview seeding.

## Product-owner approval required

These require explicit product-owner approval before implementation:

- changing invite limits,
- changing seller access approval rules,
- making buyer profiles publicly crawlable,
- adding buyer/seller messaging beyond invite workflow,
- adding payments or escrow-adjacent claims,
- adding lender integrations,
- adding subscriptions or paid visibility,
- expanding launch geography claims,
- changing trust-badge evidence requirements,
- changing legal/compliance language.
