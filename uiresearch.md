Liber should build a quiet, ownable visual system around “demand cartography”: maps, property geometry, privacy boundaries, and evidence-to-trust transformations. The current UI is already moving in the right direction—cool neutrals, Liber’s original light green, restrained blue and gold accents, flat cards, dense product information, and map-first discovery. Generic real-estate photography or character-heavy startup illustration would weaken it.
Implementation decision: ship the first milestone as reusable HTML/CSS primitives built from Liber’s existing icon system—Demand Atlas signals and privacy cues, the Trust Transformation flow, and contextual quiet states. Keep the larger property, invitation, profile, address, authentication, and error illustration families deferred until editable vector masters are approved in Figma, Affinity Designer, or Illustrator.

1. Recommended visual language
   Core idea: private demand, made legible
   Liber’s graphics should express three ideas:
   Demand exists in places, without exposing people.
   Verification converts private evidence into a public trust signal.
   A private property can be selectively introduced to a fitting buyer.
   The signature visual vocabulary should combine:
   Simplified LA street and parcel geometry.
   Approximate service-area contours.
   Circular demand signals and “privacy halos.”
   Architectural silhouettes from varied LA housing types.
   Document/evidence layers collapsing into small trust seals.
   Thin “connection paths” used only when a seller intentionally invites a buyer.
   This is more distinctive and product-appropriate than illustrations of people holding keys.
   Style
   Use edited vector artwork with:
   Orthographic or shallow-isometric architecture, never full 3D.
   Mostly straight geometry with occasional rounded landscape forms.
   Consistent 1.5–2 px strokes at base export size.
   Slightly imperfect contour lines to keep maps from feeling clinical.
   No faces or demographic coding.
   No photorealistic shadows.
   One focal object per compact asset.
   Large negative space so assets survive inside cards and mobile layouts.
   Small gold details only for attention, pending review, or a deliberate connection.
   A useful visual shorthand:
   Liber green fill: active, available, verified.
   Pale-green wash: approximate or privacy-protected geography.
   White/cool neutral: private or off-market context.
   Blue: system information and documents under review.
   Gold: pending action, review, or one deliberate connection.
   Red: errors and destructive states only—never decorative.
   Palette usage
   Retain the current tokens as the source:
   #242326 / #313033: outlines and primary architectural mass.
   #5fbe43 / #67c94f: active demand and primary accents.
   #e0f6d8 / #f2fbef: privacy halos, map areas, and verified backgrounds.
   #ffffff / #fbfbfb: illustration ground and property-card scenes.
   #0c6ba8 / #1677c8: private documents and informational states.
   #ffb22e: pending review, invitation path, or one small highlight.
   #b42318: failures only.
   Preserve the production assignment of the original Liber greens: #5fbe43 for primary controls with white foregrounds, #47a62f for public search and map signals with white foregrounds, and #67c94f only for the lighter active accent. Use #f2fbef, #e0f6d8, and #bceaad for washes, halos, and lines. Do not introduce a substitute dark-green text token or dark outlines inside filled green controls. Avoid adding “fun” purples, decorative gradients, or multiple role colors. Blue remains a semantic information color, not a competing brand accent. The interface deliberately unifies buyer and seller surfaces; the art should do the same.
2. Reusable asset families
   A. Liber Demand Atlas
   A modular library of abstract map fragments:
   Street ribbons.
   Parcel blocks.
   Service-area contour fragments.
   Demand pins with privacy halos.
   Count clusters.
   Search sweep arcs.
   Selected-area boundary treatments.
   “No demand yet” quiet map fragments.
   Production: custom vector work in Figma, Affinity Designer, or Illustrator. Implement simple variants as SVG/CSS; retain GeoJSON/Mapbox for truthful geographic boundaries.
   Important distinction: decorative atlas fragments must never resemble an actual selected boundary. Real service-area outlines must continue to come from canonical geometry.
   B. LA Property Silhouettes
   Six base property scenes:
   Mid-century single-family house.
   Bungalow.
   Stucco courtyard condo.
   Townhouse row.
   Manufactured home.
   Land/lot with slope and vegetation.
   Each should have configurable details—garage, pool, ADU, yard, parking—not separate bespoke images.
   Production: commissioned/custom vector family. The existing CSS house in the property intake page can serve as a style seed, but it should be redrawn as a coherent SVG master rather than expanded into dozens of nested CSS elements.
   C. Trust Transformation
   A three-stage graphic grammar:
   Private document or identity object.
   Admin review gate.
   Small public badge/seal.
   Use this family for verification explanations, pending states, expiration, and admin review. Never illustrate the contents of a real document.
   Production: custom vector diagrams using existing iconography for lock, document, review, shield, and clock.
   D. Invitation Thread
   A property silhouette and anonymous buyer signal connected by a single deliberate gold path. Variants:
   Ready to invite.
   Sent.
   Viewed.
   Accepted interest.
   Declined.
   Expired/withdrawn.
   The path must never imply transaction completion, escrow, or money movement.
   Production: SVG with CSS state changes. Optional motion should draw the line once after a successful send, then stop.
   E. Quiet States
   Compact illustrations for empty, pending, error, and completion states. These should occupy roughly 96–160 px, not become page heroes.
   Examples:
   Quiet map with one dormant halo.
   Empty mailbox embedded in a property gate.
   Bell resting beside a small contour map.
   Property outline awaiting an evidence stamp.
   Search loupe crossing an empty parcel grid.
   Document stack behind a lock.
   Broken boundary line for unsupported areas.
   Shield with a small clock for verification pending.
   Production: custom SVG assembled from the four families above.
3. Exact concepts and placements
   Public homepage
   Keep the live demand map dominant. Do not add a separate hero illustration.
   Use:
   A subtle branded fallback-map texture in PublicDemandMap: sparse street ribbons, parcel seams, and privacy halos.
   A small “privacy legend” graphic beside “Anonymized preview — exact locations stay private”: precise point → softened halo → approximate pin.
   An empty selected-area state inside the current demand panel: contour fragment with one dormant signal rather than a generic empty card.
   A signup-wall graphic using a cropped map under a translucent lock—not a person or house photograph.
   On mobile, collapse the privacy legend to a 24 px halo icon plus text; omit decorative streets.
   Production: CSS/SVG. Do not use AI-generated raster art here because it will clash with the live map and reduce geographic credibility.
   Seller search
   Highest-value asset opportunity.
   Use:
   A consistent buyer-demand pin family: individual demand, cluster, highlighted match, and self-owned non-invitable demand.
   A “why this matches” mini-diagram inside or immediately below BuyerCard: property silhouette on the left, three matching criteria nodes, buyer signal on the right.
   A no-results state in the results region: selected boundary plus a search sweep that found no signals.
   A pending seller-access graphic above the read-only preview: frosted directory grid behind a review gate.
   A suspended state: closed gate without buyer signals or map detail.
   A no-location-selected cue near the geography control: contour locator with an open boundary.
   Map fallback art consistent with the public map, but with number-first demand markers.
   Production: SVG/CSS and existing iconography. The match diagram should be data-driven only when implementation is later authorized; this strategy does not propose new matching behavior.
   Buyer profile and criteria onboarding
   Use visuals to explain the profile’s marketplace role without exposing identity:
   At the profile handoff, show private account identity entering a privacy screen and emerging as an alias/avatar plus criteria card.
   During location selection, show a precise cursor becoming a service-area halo.
   In criteria sections, use modular property-feature silhouettes for pool, garage, ADU, yard, and parking—not new pictograms if the existing icon set covers them.
   On profile completion, show the buyer signal appearing on an abstract map with the copy “Your demand can now be found,” only if the profile is actually searchable.
   For incomplete profiles, use a partially assembled map signal rather than a progress trophy.
   Production: Figma-authored SVG scenes, with icons from the existing system.
   Authentication and signup
   The current login page benefits from restraint. Do not place a large illustration beside the form.
   Use:
   A faint, non-interactive “gateway” contour watermark behind the login header at desktop sizes only.
   Signup role cards may receive compact property/demand glyph compositions:Buyer: demand halo approaching a house silhouette.
   Seller: house silhouette scanning several anonymous demand halos.
   Both: two-way workspace switch, not circular arrows implying transactions.

Email verification: envelope crossing a single boundary gate.
Invalid/expired link: opened gate with a stopped dotted path.
Account recovery: identity key and locked account record—avoid alarming breach imagery.
Password step: no decorative art beyond the existing key/lock icon.
Production: custom SVG and existing icons. Keep all assets decorative with empty alt text unless they communicate information not already in the adjacent copy.
Profile/account page
Keep private identity visually separate from marketplace identity:
A two-column identity diagram below the profile header:“Your private account”: name/email/avatar.
“Marketplace presence”: generated alias/avatar and criteria.

Use a privacy partition or frosted divider between them.
A small role-workspace diagram may link Buyer and Seller workspaces for dual-role users.
Production: custom diagram in Figma; SVG export. This is a conceptual explanation, not a new workflow.
Buyer verification and badges
This is the best place for trust graphics.
Use:
Replace the text-only “Why get verified?” lead with a document → private review → seller-visible badge diagram.
Above upload, add a tiny lock-and-vault illustration; never show document text or financial amounts.
Empty badge status: three outlined shield sockets labeled by supported evidence-backed badge types.
Pending: a shield with a clock orbit segment.
Expiring: the same clock segment in amber.
Active: a restrained one-time seal fill, not confetti.
Rejected evidence: document returning behind the privacy screen with corrective guidance; no red X stamped across a fake ID.
Production: custom vectors. Use SVG/CSS for status changes.
Properties
Use the LA Property Silhouettes extensively:
Property list empty state: one quiet property outline sitting on a parcel with an “add” marker.
Property cards: small type-specific silhouettes only when no private property image is available or authorized.
New-property hero: upgrade the current CSS house scene into the base Liber property style.
Address lookup:Initial: a street ribbon approaching a parcel.
Found: parcel resolves into a house silhouette.
Unsupported ZIP: ribbon ends outside a service-area contour.
Provider unavailable: parcel remains usable but unfilled, communicating manual entry.

Ownership review: property + two locked evidence tiles + review shield.
Identity-changing edit warning: old and new property silhouettes separated by a version boundary, with prior invite threads retracting.
Image empty state: stacked private-photo frames with a lock.
Production: custom SVG; CSS shapes only for tiny decorative backdrops.
Seller invite composition
Place a compact invitation-thread diagram between selected buyer and property summary:
Anonymous buyer alias/signal.
Selected private property silhouette.
One gold connection path.
Manual-invite label.
Lock below the path to reinforce private context.
Near the legal disclaimer, use only a small information shield. Do not illustrate contracts, handshakes, offers, money, keys changing hands, or checkered finish lines.
After successful send, the path can draw for 400–600 ms and settle. Respect prefers-reduced-motion.
Buyer invites
Use:
Empty state: quiet property gate and mailbox, with no visible address.
Invite cards without authorized images: property-type silhouette.
Accepted interest: connection thread becomes Liber green, but does not reach a transaction icon.
Declined: line gently recedes; avoid rejection characters or emotional faces.
Expired: dotted thread fades into a clock.
Production: custom SVG states plus existing icons.
Notifications
Buyer and seller can share one family with different object combinations:
All quiet: a bell nested into a map contour with dormant demand points.
New invite: property outline plus one short thread.
Verification decision: private document behind a shield.
Property review: house silhouette with evidence tiles.
Unread indicators should remain UI components, not animated illustrations.
Use no continuous motion. A new notification may receive one 150–200 ms scale-in or opacity transition.
Admin
Admin should remain utilitarian.
Appropriate graphics:
Small review-category glyphs on dashboard cards.
Consistent evidence lifecycle diagram in Documents and Badges.
Empty queue states using a cleared tray or completed review gate.
A small legend explaining evidence privacy and resulting public badge visibility.
Avoid:
Large illustrations.
Decorative motion.
AI-generated content.
People, houses, or celebratory graphics around suspensions, identity review, audit logs, or sensitive documents.
Production: existing iconography and a small custom admin diagram set.
Errors, not-found, and unsupported geography
Create shared illustrations:
404: disconnected street fragment whose destination marker is missing.
Generic error: map layer offset from its boundary.
Unsupported geography: selected contour outside the active LA County frame.
Map unavailable: intact search/list cards over a muted map grid; this communicates graceful degradation.
Rate limit: demand pulses paused by a clock, not a police barrier.
Production: custom SVG/CSS. 4. Motion direction
Motion should communicate state, never entertain during serious workflows.
Recommended:
Demand pin highlight: 160–220 ms halo expansion.
Selected-area boundary: 250 ms fade/stroke reveal.
Match connection: 300–450 ms path draw.
Verification approval: one 250 ms shield fill.
Invite send: one 400–600 ms thread draw.
Empty-state entrance: opacity only, maximum 200 ms.
Map pins and notifications: no ambient bouncing.
Property illustration: no floating house, swaying trees, or looping clouds.
Every animation must:
Disable or simplify under prefers-reduced-motion.
Preserve the final state without JavaScript.
Avoid changing layout.
Avoid delaying access to controls.
Stay below roughly 30 KB compressed for a small vector animation.
Prefer CSS/SVG. Lottie is suitable only if a motion designer produces an original file and the runtime cost is justified. Public LottieFiles animations permit commercial use but derivative files remain subject to the same license terms, which complicates proprietary asset governance; avoid community downloads for Liber’s signature motion. LottieFiles license 5. Production-method recommendations
Method Best Liber use Tradeoff
Figma, Illustrator, or Affinity Master illustrations, property family, trust diagrams, atlas fragments Most consistent and editable; requires illustration discipline
CSS shapes Tiny halos, map texture, status accents, simple skeletons Fast and lightweight; becomes brittle for detailed scenes
Existing iconography Controls, compact states, admin glyphs Highest consistency; not distinctive enough for signature scenes
AI generation Early moodboards, architectural composition exploration, texture ideation Fast exploration, but weak repeatability and editability; never ship raw output
Online illustration libraries Internal references and temporary prototypes Often recognizable and generic; licensing and visual drift require care
Stock/licensed photography Editorial content or future campaign work—not core product UI Authentic photography can be useful, but homes/people create representation and rights issues
Commissioned custom work Final property silhouettes and signature atlas/trust family Highest originality and consistency; more cost and lead time

AI use policy
AI may help create a private moodboard or rough composition, followed by a complete human redraw. Do not trace or prompt for a living illustrator’s style. Store the prompt, model/version, references, generation date, and redrawing notes.
AI should not produce:
Logos or brand marks.
Trust badges.
Maps or geographic boundaries.
Identity/evidence imagery.
Realistic people presented as Liber users.
Property imagery presented as an actual seller property.
Legal, financial, verification, or ownership documents.
Final icon families.
Final production SVG paths without human reconstruction and review.
Adobe’s current generative-AI guidelines prohibit infringing or deceptive uses and require responsibility for the material supplied and generated; a tool’s availability is not a substitute for asset clearance. Adobe generative AI guidelines 6. Libraries and licensing guidance
Continue using or extending Lucide-like utility iconography if it matches the existing icon component. Lucide uses ISC, with some Feather-derived icons under MIT; retain the required copyright/license notices. Lucide license
unDraw permits commercial use, modification, and use without attribution, but its style is recognizable and its current license prohibits using assets for AI training. Use only for internal composition reference or deeply redrawn non-signature prototypes. unDraw license
Storyset’s free use requires attribution; no-attribution use requires the specified premium subscription, and its derivative/transfer conditions deserve legal review. It is not a strong choice for an ownable Liber system. Storyset terms
Unsplash allows free commercial and non-commercial use without required attribution, while prohibiting unmodified resale and competing collections. Even so, model/property releases, recognizable locations, and visual authenticity must be reviewed per image. Use it only for editorial moodboards or future marketing, not buyer/property records. Unsplash license
For every third-party asset, save:
Source URL.
Creator.
Download date.
License name and snapshot/PDF.
Attribution requirement.
Modifications.
Where it ships.
Internal approver. 7. Accessibility, responsive, and performance rules
Decorative assets: aria-hidden="true" or empty alt text.
Informational diagrams: equivalent adjacent text; never encode status by color alone.
Minimum 3:1 contrast for meaningful graphic shapes against their background.
Do not place text inside responsive SVGs unless it is duplicated as accessible HTML.
Mobile exports should be recomposed, not merely shrunk. Remove secondary parcels, trees, and paths below 480 px.
Keep compact SVGs under approximately 20 KB gzipped and major scenes under 60 KB.
Use optimized inline SVG for themeable state graphics; use external SVG for static reused scenes.
Raster assets, if ever needed: AVIF/WebP with explicit dimensions and responsive sources.
Avoid SVG filters, embedded rasters, huge path counts, and excessive masks.
Test at 320, 375, 768, 1024, and 1440 px plus 200% zoom.
Check high contrast, reduced motion, and grayscale distinguishability. 8. Impact-versus-effort ranking
Priority Asset initiative Impact Effort
1 Demand Atlas pin, halo, cluster, boundary, and fallback-map family Very high Medium
2 Trust Transformation diagram and badge states Very high Medium
3 Shared Quiet States for invites, notifications, search, properties High Medium
4 LA Property Silhouette base family High Medium–high
5 Invitation Thread states High Low–medium
6 Profile privacy/alias diagram Medium–high Medium
7 Address-lookup state graphics Medium Medium
8 Auth/signup role glyphs Medium Low
9 Error/404/unsupported geography family Medium Low–medium
10 Admin review diagrams Low–medium Low
11 Rich animated scenes Low High

Do not begin with a large homepage illustration. The product’s map is already its hero. 9. What must never be generated or copied
Exact or approximate copies of Zillow, Redfin, Airbnb, MLS, Mapbox, or brokerage visual systems.
Competitor pin shapes, map controls, listing cards, or proprietary iconography.
Google/Apple map screenshots or traced road geometry.
Real buyer photos or faces for generated aliases.
Fake testimonials, reviews, badges, transactions, or ownership evidence.
Fake property photography presented as seller-owned inventory.
Government IDs, lender letters, bank statements, title records, or financial amounts.
Protected-class cues in buyer illustrations.
Handshake, cash, escrow, closing, or “deal completed” imagery in the invite flow.
Raw AI output containing malformed architecture, illegible text, hidden signatures, watermarks, or copied visual styles.
Decorative geography that could be mistaken for a real selected service area. 10. Implementation-ready placement matrix
Surface Exact placement Asset Method Responsive behavior
Public homepage PublicDemandMap fallback/background Demand Atlas map fragment SVG/CSS Remove minor parcels on mobile
Public homepage Privacy line under demand panel Exact point → privacy halo → approximate pin SVG Collapse to one halo icon
Public homepage No previews in selected area Dormant boundary scene SVG 96 px compact crop
Public homepage Signup-wall card Locked demand-map crop SVG/CSS Icon-only crop below 375 px
Seller search Map markers Demand pin/cluster/highlight family SVG/CSS Preserve minimum hit target
Seller search Empty results region Boundary plus empty search sweep SVG Stack above copy
Seller search Pending/rejected access header Frosted directory review gate SVG Remove grid detail
Buyer card Optional match explanation Property → criteria → demand diagram SVG + HTML Horizontal becomes stacked
Buyer profile Privacy explanation Account → privacy partition → alias SVG Two panels stack vertically
Buyer onboarding Location selection helper Cursor → service-area halo SVG Compact 80 px variant
Signup role cards Inside current role icon position Buyer/seller/both compositions SVG Use glyph-only variant
Email verification Above status copy Envelope crossing account gate SVG 112 px maximum
Login Behind header, desktop only Faint contour gateway CSS/SVG Omit on mobile
Buyer badges Above “Why get verified?” Evidence → review → badge SVG diagram Vertical three-step flow
Badge status cards Existing badge area Pending/active/expiring shields SVG/CSS No animation required
Seller properties Empty state Property on empty parcel SVG 120 px compact
New property Existing intake hero LA property silhouette scene Custom SVG Simplified house/ground
Address lookup Lookup state area Street → parcel → property states SVG Single-object crops
Ownership review Near evidence requirements Property + two locked evidence tiles SVG Stack evidence tiles
Invite composer Between buyer/property summaries Manual invitation thread SVG/CSS Vertical path on mobile
Buyer invites Empty state Private property gate/mailbox SVG 112 px compact
Invite cards Missing private image area Type-specific property silhouette SVG Fixed aspect ratio
Notifications Existing EmptyState Bell in quiet map contour SVG Shared buyer/seller version
Admin dashboard Current card icons Review-category glyph set Existing icons No special adaptation
Admin documents/badges Above queue or help copy Private evidence lifecycle SVG Vertical diagram
404/error Main error panel Missing destination street fragment SVG Remove background parcels
Unsupported area Existing state component Contour outside LA frame SVG Icon-plus-boundary crop

11. First asset batch
    Create these eight masters first:
    atlas-demand-signals.svg
    Individual, highlighted, clustered, dormant, and privacy-halo demand signals.

atlas-fallback-la-fragment.svg
Abstract streets/parcels for public and seller fallback maps; explicitly non-geographic.

diagram-private-to-trusted.svg
Private evidence → review → public badge, with horizontal and vertical compositions.

property-family-core.svg
House, condo, townhouse, manufactured, and land silhouettes in one source file.

state-search-empty.svg
Selected boundary and empty search sweep.

state-invites-empty.svg
Property gate/mailbox scene with buyer and seller copy variants.

state-notifications-quiet.svg
Bell nested into a dormant demand contour.

diagram-manual-invite.svg
Anonymous buyer signal connected to a private property, with sent/viewed/accepted-interest/declined/expired states.

Naming and exports
Use:
liber-{family}-{concept}-{state}-{layout}-v01.svg
Examples:
liber-atlas-demand-highlight-compact-v01.svg
liber-trust-evidence-approved-horizontal-v01.svg
liber-property-townhouse-neutral-card-v01.svg
liber-invite-thread-expired-vertical-v01.svg
Keep editable masters in a dedicated design source with named layers and component properties. Export:
Clean SVG with viewBox.
No embedded fonts, metadata, editor namespaces, or raster images.
currentColor only where the consuming component should control color.
Fixed semantic fills for multi-color signature illustrations.
Separate compact/mobile composition where needed.
PNG previews for design review only, not production. 12. Approval workflow
Brief: placement, message, data/privacy constraints, dimensions, and required states.
Three black-and-white thumbnails; select composition before polishing.
Palette pass using only existing Liber tokens.
Product review for scope and meaning.
Privacy/compliance review for maps, documents, identities, and claims.
Accessibility review with adjacent text, contrast, zoom, and reduced motion.
Engineering review for SVG safety, weight, responsiveness, and reuse.
License/provenance record.
Desktop/mobile visual QA in real empty, pending, success, error, and long-copy states.
Final approval and versioned export.
The strongest first milestone is the Demand Atlas plus Trust Transformation families. Together they will improve the homepage, seller search, onboarding, verification, invites, notifications, properties, errors, and admin without adding a disconnected illustration style.
Implementation status
The first milestone is implemented in the UI refresh branch:
Demand Atlas backdrop primitives are shared by public and seller fallback maps.
Public preview includes a compact exact-point → privacy-halo → approximate-signal explanation.
Public and seller map signals use the same circular grammar, production deep-green fill with white centers and outlines, muted-green privacy halos, visible focus, and 44 px targets.
Buyer verification includes the private evidence → Liber review → visible badge explanation.
Search, seller access, property, invite, and notification empty states reuse one quiet contour/parcel/signal system.
The shared UI micro-document records the authoritative palette, accessibility treatment, and geometry boundary.

No product behavior, authorization, schema, migration, environment variable, or dependency changed. Larger signature artwork remains subject to the approval workflow above and should not be replaced with raw AI or third-party illustration-library output.
