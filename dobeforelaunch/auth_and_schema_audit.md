# Pre-Launch Authentication & Database Schema Audit

This document outlines the user auth architecture, role sync logic, database schemas, stored data fields, and the specific security and integrity gaps that must be resolved before deploying to production.

---

## 1. User Authentication & Synchronization Flow

Liber uses **Supabase Auth** (`auth.users`) for core login and session management, which then synchronizes into the database (`public."User"`).

```
[User / Client] ---> (Sign Up / Sign In) ---> [Supabase Auth]
                                                    |
                                          (Postgres Trigger Fires)
                                                    v
[Next.js Server Action] <--- (JWT Session) <--- [public."User" Table]
          |
 (onboarding/role choice)
          v
1. Updates roles in public."User"
2. Runtime authorization reads public."User".roles
```

### Trigger-Based Sync (`auth.users` -> `public."User"`)
To guarantee database consistency, we use native PostgreSQL triggers instead of relying entirely on application code.
* **Insert Trigger**: When a user registers, `on_auth_user_created` calls `app_private.handle_new_user()`. It extracts metadata fields (like `name` and `avatarUrl`) from the auth sign-up request and creates the public `"User"` row.
* **Update Trigger**: When a user updates their password or metadata in Supabase, `on_auth_user_updated` synchronizes changes into `public."User"`.
* **Security Definer**: Both functions run as `SECURITY DEFINER` inside a dedicated `app_private` schema with their `search_path` locked down to prevent execution hijacking.

### Onboarding Role Persistence
When a user selects their role (Buyer, Seller, or Both), a Next.js Server Action calls `persistUserRoles()`:
1. It updates the `roles` array (`UserRole[]`) in the Postgres database.
2. It does not mirror roles into Supabase `app_metadata`. Authorization intentionally reloads server-controlled roles from `public."User"` so JWT role claims cannot drift from the database.

---

## 2. Creating a Buyer Account vs. Seller Account

A single account in Liber can hold multiple roles (`BUYER`, `SELLER`, or `ADMIN`) simultaneously using Postgres Enum Arrays. However, the data structures initialized for each role differ:

### A. The Buyer Profile Structure
When onboarding as a **Buyer**, the application creates a `BuyerProfile` linked 1:1 to the `User`.
* **Criteria**: A buyer can create multiple `BuyerCriteria` records detailing exactly what they are looking for (e.g., price limits, size, bedroom counts, property subtype).
* **Badges**: Buyers are issued administrative trust badges (e.g. `PRE_APPROVED`, `CASH_BUYER`, `EARNEST_MONEY_DEPOSITED`).
* **Documents**: Buyers upload pre-approval letters or proof of funds documents to get badges. These are stored in `VerificationDocument` referencing their `BuyerProfile` and the `verification-documents` secure storage bucket.

### B. The Seller Structure
Unlike Buyers, **Sellers do not have a dedicated `SellerProfile` table**. Instead, a Seller is defined by the property (or properties) they list.
* **Properties**: A seller owns one or more `SellerProperty` listings.
* **Property Images**: Stored in a public `property-images` bucket.
* **Ownership Verification**: Sellers upload proof of ownership documents (e.g., deed, utility bill) which are tracked in the `VerificationDocument` table referencing their specific `SellerProperty`.
* **Invite Constraints**: When a seller invites a buyer, a database trigger enforces strict verification-based rules:
  * If the seller's property is **unverified**, they are rate-limited to **5 invites per 24 hours**.
  * Once the property ownership document is **approved** by an admin, the daily limit rises to **25 invites per 24 hours**.

---

## 3. Database Schema Definitions (Prisma DDL)

### Core User & Profile Tables
```prisma
enum UserRole {
  BUYER
  SELLER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum BuyerVisibilityStatus {
  DRAFT
  ACTIVE
  HIDDEN
  SUSPENDED
}

model User {
  id          String                 @id @db.Uuid
  email       String                 @unique
  phone       String?
  name        String?
  avatarUrl   String?
  roles       UserRole[]             @default([])
  status      UserStatus             @default(ACTIVE)
  suspendedAt DateTime?

  buyerProfile      BuyerProfile?
  sellerProperties  SellerProperty[]     @relation("SellerProperties")
  sellerInvites     Invite[]             @relation("SellerInvites")
  notifications     Notification[]
  documents         VerificationDocument[] @relation("UserDocuments")
  badgesVerified    BuyerBadge[]           @relation("BadgeVerifier")
  documentsReviewed VerificationDocument[] @relation("DocumentReviewer")
  reviewsWritten    Review[]               @relation("ReviewsWritten")
  reviewsReceived   Review[]               @relation("ReviewsReceived")
  auditLogs         AdminAuditLog[]        @relation("AuditActor")

  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  @@index([email])
}

model BuyerProfile {
  id                  String                 @id @default(cuid())
  userId              String                 @unique @db.Uuid
  user                User                   @relation(fields: [userId], references: [id], onDelete: Cascade)

  displayName         String
  buyerType           String?                // e.g., Individual, LLC, Fund
  bio                 String?
  buyingPurpose       String?                // e.g., Owner-occupant, Investment
  desiredLocationText String?
  desiredCity         String?
  desiredState        String?
  desiredLat          Decimal?               @db.Decimal(10, 7)
  desiredLng          Decimal?               @db.Decimal(10, 7)
  budgetMin           Decimal?               @db.Decimal(12, 2)
  budgetMax           Decimal?               @db.Decimal(12, 2)
  downPaymentMin      Decimal?               @db.Decimal(12, 2)
  downPaymentMax      Decimal?               @db.Decimal(12, 2)
  visibilityStatus    BuyerVisibilityStatus  @default(DRAFT)
  profileCompleteness Int                    @default(0)
  ratingAverage       Decimal?               @db.Decimal(3, 2)
  reviewCount         Int                    @default(0)
  lastRefreshedAt     DateTime?

  criteria            BuyerCriteria[]
  badges              BuyerBadge[]
  invites             Invite[]
  documents           VerificationDocument[]

  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  @@index([visibilityStatus])
  @@index([desiredCity, desiredState])
  @@index([budgetMin, budgetMax])
}
```

### Criteria, Badges, & Property Tables
```prisma
model BuyerCriteria {
  id               String           @id @default(cuid())
  buyerProfileId   String
  buyerProfile     BuyerProfile     @relation(fields: [buyerProfileId], references: [id], onDelete: Cascade)

  propertyCategory PropertyCategory // HOME, LAND, COMMERCIAL
  propertySubtype  PropertySubtype  // HOME, MULTIFAMILY, INDUSTRIAL, etc.
  priceMin         Decimal?         @db.Decimal(12, 2)
  priceMax         Decimal?         @db.Decimal(12, 2)
  squareFeetMin    Int?
  squareFeetMax    Int?
  lotSizeMin       Int?
  lotSizeMax       Int?
  bedroomsMin      Int?
  bathroomsMin     Int?
  capRateMin       Decimal?         @db.Decimal(5, 2)
  capRateMax       Decimal?         @db.Decimal(5, 2)
  unitsMin         Int?
  unitsMax         Int?
  yearBuiltMin     Int?
  yearBuiltMax     Int?
  condition        String?
  zoning           String?
  features         String[]         @default([])
  extraCriteria    Json?

  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([buyerProfileId])
  @@index([propertyCategory, propertySubtype])
  @@index([priceMin, priceMax])
}

model BuyerBadge {
  id               String       @id @default(cuid())
  buyerProfileId   String
  buyerProfile     BuyerProfile @relation(fields: [buyerProfileId], references: [id], onDelete: Cascade)

  badgeType        BadgeType    // PRE_APPROVED, CASH_BUYER, EARNEST_MONEY_DEPOSITED, etc.
  status           BadgeStatus  // PENDING, ACTIVE, EXPIRED, REJECTED, REVOKED
  issuedAt         DateTime?
  expiresAt        DateTime?
  verifiedByUserId String?      @db.Uuid
  verifiedBy       User?        @relation("BadgeVerifier", fields: [verifiedByUserId], references: [id], onDelete: SetNull)
  source           String?
  notes            String?

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@index([buyerProfileId])
  @@index([badgeType, status])
  @@index([expiresAt])
  @@index([verifiedByUserId])
  @@unique([buyerProfileId, badgeType])
}

model SellerProperty {
  id                          String                     @id @default(cuid())
  ownerUserId                 String                     @db.Uuid
  owner                       User                       @relation("SellerProperties", fields: [ownerUserId], references: [id], onDelete: Cascade)

  addressLine1                String?
  addressLine2                String?
  city                        String?
  state                       String?
  zip                         String?
  lat                         Decimal?                   @db.Decimal(10, 7)
  lng                         Decimal?                   @db.Decimal(10, 7)
  propertyType                PropertySubtype            // HOME, MULTIFAMILY, INDUSTRIAL, LAND, etc.
  bedrooms                    Int?
  bathrooms                   Int?
  garageArea                  Int?
  squareFeet                  Int?
  lotSize                     Int?
  condition                   String?
  features                    String[]                   @default([])
  description                 String?
  price                       Decimal?                   @db.Decimal(12, 2)
  ownershipVerificationStatus PropertyVerificationStatus @default(NOT_SUBMITTED)
  flaggedForReviewAt          DateTime?

  images                      PropertyImage[]
  invites                     Invite[]
  documents                   VerificationDocument[]

  createdAt                   DateTime                   @default(now())
  updatedAt                   DateTime                   @updatedAt

  @@index([ownerUserId])
  @@index([city, state])
  @@index([propertyType])
}

model VerificationDocument {
  id               String         @id @default(cuid())
  userId           String         @db.Uuid
  user             User           @relation("UserDocuments", fields: [userId], references: [id], onDelete: Cascade)
  buyerProfileId   String?
  buyerProfile     BuyerProfile?  @relation(fields: [buyerProfileId], references: [id], onDelete: Cascade)
  propertyId       String?
  property         SellerProperty? @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  documentType     DocumentType   // OWNERSHIP, PRE_APPROVAL, VERIFIED_FUNDS, IDENTITY, OTHER
  storagePath      String         // Path inside the private bucket
  status           DocumentStatus @default(PENDING)
  reviewedByUserId String?        @db.Uuid
  reviewedBy       User?          @relation("DocumentReviewer", fields: [reviewedByUserId], references: [id], onDelete: SetNull)
  reviewedAt       DateTime?
  rejectionReason  String?

  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  @@index([userId])
  @@index([buyerProfileId])
  @@index([propertyId])
  @@index([reviewedByUserId])
  @@index([status])
}
```

---

## 4. Data Dictionary (Everything We Store)

### Core Profile Details
* **User (`User` table)**: Stored automatically upon signup. We store `id` (matches Supabase Auth `uuid`), `email`, `name`, and optional `phone`/`avatarUrl`. 
* **Roles (`User.roles`)**: An array structure containing `'BUYER'`, `'SELLER'`, or both.
* **Status (`User.status`)**: Tracked if an account gets flagged. It can be `'ACTIVE'` or `'SUSPENDED'`, disabling user actions.

### Buyer Profile & Criteria
* **Profile Metadata (`BuyerProfile`)**: `displayName`, `buyerType` (individual vs. LLC), `bio`, and `buyingPurpose` (investment vs. primary residence).
* **Location Targeting**: A human-readable text string (`desiredLocationText`), the explicit targeting fields (`desiredCity`, `desiredState`), and coordinates (`desiredLat`, `desiredLng`) used to build spatial coordinates in database queries.
* **Financial Constraints**: `budgetMin`/`budgetMax` (defines search bounds) and `downPaymentMin`/`downPaymentMax` (shows deal strength to sellers).
* **Detailed Matching Parameters (`BuyerCriteria`)**: Individual search target entries with exact ranges (price, square footage, lot size, bedroom/bathroom minimums, zoning requirements, target capitalization rates for commercial properties, and custom features lists).

### Seller Property Profiles
* **Location details**: Address fields (line 1, line 2, city, state, zip) along with spatial coordinates (`lat`, `lng`).
* **Attributes**: Bedroom count, bathroom count, garage area, building square footage, lot size, general condition description, features list (e.g. `["Pool", "Solar Panels"]`), and the target listing `price`.
* **State & Flagging**:
  * `ownershipVerificationStatus`: Tells the app if an admin has validated that the seller actually owns this property.
  * `flaggedForReviewAt`: Stores a timestamp if the property has been flagged by users or admins, preventing invites from being sent.

### Private Documents & Verification State
* **Document Metadata (`VerificationDocument`)**: Points to files stored in the private `verification-documents` bucket (not accessible directly without a signed Supabase URL or admin credentials). Tracks document type, review decisions, who reviewed it, and why it was rejected (if applicable).
* **Badges (`BuyerBadge`)**: Stamped validations indicating verified buyer statements. Earnest Money badges state whether an escrow company/title company verified the receipt of EMD offline (we do not hold money in Liber v1).

---

## 5. Security & Architectural Gaps to Address Before Launch

The following items are critical gaps in the system that must be resolved before deployment:

### 1. Row Level Security (RLS) is Enabled but Empty
* **Problem**: RLS is turned on for all tables, but no policies (SELECT/INSERT/UPDATE/DELETE) are defined.
* **Remediation**:
  * If the Next.js app accesses the database solely through Prisma (bypassing RLS), RLS is non-operational.
  * If client-side queries using Supabase Client are planned, policies must be written immediately to permit authenticated reading/writing of profiles and properties.

### 2. Admin Role Assignment
* **Status**: Admin cannot be self-assigned through signup or onboarding. Runtime authorization reads server-controlled `User.roles`.
* **Remaining requirement**: Production admin assignment must be a controlled operational process.

### 3. Audit Log Retention
* **Status**: The audit-hardening migration changes `AdminAuditLog.actorUserId` to nullable with `onDelete: SetNull`, preserving audit rows if an admin user is deleted.

### 4. Document and Location Constraints
* **Status**: The audit-hardening migration adds check constraints for document subject ownership, coordinate bounds, review rating bounds, and min/max range ordering.

### 5. Email Verification & Custom SMTP Configuration
* **Problem**: The default Supabase SMTP server is restricted to 2 emails/hour, causing `429: Email rate limit exceeded` errors.
* **Remediation**:
  * Use **Resend** as the production email provider.
  * Register a domain, set up DNS verification in Resend, and add the Resend SMTP credentials under Supabase's **Authentication -> Emails** settings.
  * Keep **Confirm email** turned **OFF** in the Supabase Dashboard for development testing to prevent verification email rate limit blocks, but toggle it **ON** before launching to production.
