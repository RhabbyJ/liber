import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const testUrl = process.env.SELLER_PROPERTY_INTEGRITY_TEST_DATABASE_URL;
await assertDisposableDatabase(testUrl);

const ids = {
  buyer: randomUUID(),
  buyer2: randomUUID(),
  market: randomUUID(),
  otherSeller: randomUUID(),
  seller: randomUUID(),
  serviceArea: randomUUID(),
};
const proposalPath = path.resolve(
  "packages/db/prisma/proposals/seller-property-integrity.forward.sql",
);
const client = new pg.Client({ connectionString: testUrl });

await client.connect();
try {
  await assertBaseline(client);
  await seedLegacyState(client);
  await client.query(await readFile(proposalPath, "utf8"));
  await assertProposalCatalog(client);

  const legacy = await assertLegacyEvidenceReopened(client);
  const ownership = await assertVersionedOwnership(client);
  const reviewRace = await assertConcurrentDocumentReview(client);
  const inviteGuards = await assertInviteGuards(client);
  const inviteExpiry = await assertInviteExpiryAtUse(client);
  const inviteRace = await assertConcurrentDuplicateInvite(client);

  process.stdout.write(`${JSON.stringify({ inviteExpiry, inviteGuards, inviteRace, legacy, ownership, reviewRace }, null, 2)}\n`);
} finally {
  await client.end();
}

async function assertBaseline(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public."SellerProperty"') IS NOT NULL AS has_property,
      to_regclass('public."Invite"') IS NOT NULL AS has_invite,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'SellerProperty'
          AND column_name = 'ownershipVersion'
      ) AS proposal_already_applied,
      to_regprocedure('app_private.prevent_user_id_update()') IS NOT NULL AS identity_hardened
  `);
  const row = result.rows[0];
  if (!row?.has_property || !row?.has_invite || !row?.identity_hardened || row?.proposal_already_applied) {
    throw new Error(`Unexpected seller-property integrity baseline: ${JSON.stringify(row)}`);
  }
}

async function assertProposalCatalog(db) {
  const result = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."Invite"'::regclass
          AND conname = 'Invite_expiresAt_after_sentAt_check'
          AND contype = 'c'
      ) AS invite_expiry_check,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'Invite_one_active_per_seller_buyer_property_key'
      ) AS active_invite_unique,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."SellerProperty"'::regclass
          AND tgname = 'enforce_property_ownership_state'
          AND NOT tgisinternal
      ) AS property_trigger,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."VerificationDocument"'::regclass
          AND tgname = 'enforce_ownership_evidence_binding'
          AND NOT tgisinternal
      ) AS evidence_trigger
  `);
  if (!Object.values(result.rows[0] ?? {}).every(Boolean)) {
    throw new Error(`Seller-property proposal catalog mismatch: ${JSON.stringify(result.rows[0])}`);
  }
}

async function seedLegacyState(db) {
  for (const [id, label] of [
    [ids.seller, "Seller"],
    [ids.otherSeller, "Other seller"],
    [ids.buyer, "Buyer"],
    [ids.buyer2, "Buyer two"],
  ]) {
    await db.query(
      `INSERT INTO auth.users (
         id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) VALUES ($1, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
      [id, `seller-property-integrity-${id}@example.invalid`, label],
    );
  }

  await db.query(
    `UPDATE public."User"
     SET roles = CASE
       WHEN id IN ($1, $2) THEN ARRAY['SELLER', 'BUYER']::public."UserRole"[]
       ELSE ARRAY['BUYER']::public."UserRole"[]
     END
     WHERE id IN ($1, $2, $3, $4)`,
    [ids.seller, ids.otherSeller, ids.buyer, ids.buyer2],
  );
  await db.query(
    `INSERT INTO public."SellerAccess" (id, "userId", status, "createdAt", "updatedAt")
     VALUES
       ('seller-property-integrity-access-1', $1, 'APPROVED', now(), now()),
       ('seller-property-integrity-access-2', $2, 'APPROVED', now(), now())`,
    [ids.seller, ids.otherSeller],
  );

  await db.query(
    `INSERT INTO public.markets (
       id, slug, label, state, country, center_lat, center_lng,
       bbox_west, bbox_south, bbox_east, bbox_north, active
     ) VALUES ($1, $2, 'Integrity test market', 'CA', 'US', 34, -118, -119, 33, -117, 35, true)`,
    [ids.market, `integrity-${ids.market}`],
  );
  await db.query(
    `INSERT INTO public.service_areas (
       id, market_id, slug, label, type, state, center_lat, center_lng,
       bbox_west, bbox_south, bbox_east, bbox_north, geojson_path,
       source, source_version, active, is_pilot
     ) VALUES (
       $1, $2, 'integrity-area', 'Integrity area', 'CITY', 'CA', 34, -118,
       -119, 33, -117, 35, '/integrity.geojson', 'TEST', '1', true, true
     )`,
    [ids.serviceArea, ids.market],
  );

  await db.query("BEGIN");
  try {
    for (const [profileId, userId, displayName] of [
      ["integrity-buyer", ids.buyer, "Buyer fixture"],
      ["integrity-buyer-2", ids.buyer2, "Buyer two fixture"],
      ["integrity-self-buyer", ids.seller, "Seller buyer fixture"],
    ]) {
      await db.query(
        `INSERT INTO public."BuyerProfile" (
           id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, 'ACTIVE', now(), now())`,
        [profileId, userId, displayName],
      );
      await db.query(
        `INSERT INTO public.buyer_desired_service_areas (
           buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
         ) VALUES ($1, $2, 'SELECTED', true, now(), now())`,
        [profileId, ids.serviceArea],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  await db.query(
    `INSERT INTO public."SellerProperty" (
       id, "ownerUserId", "addressLine1", city, state, zip, lat, lng,
       "propertyType", "ownershipVerificationStatus", "createdAt", "updatedAt"
     ) VALUES (
       'integrity-property', $1, '123 Original St', 'Los Angeles', 'CA', '90001', 34, -118,
       'HOME', 'APPROVED', now(), now()
     )`,
    [ids.seller],
  );
  await db.query(`
    INSERT INTO public."VerificationDocument" (
      id, "userId", "propertyId", "documentType", "storagePath",
      "reviewStatus", "reviewedAt", "ownershipEvidenceKind", "createdAt", "updatedAt"
    ) VALUES
      ('integrity-legacy-evidence', $1, 'integrity-property', 'OWNERSHIP', $2,
       'APPROVED', now(), NULL, now(), now()),
      ('integrity-legacy-id', $1, 'integrity-property', 'OWNERSHIP', $3,
       'APPROVED', now(), 'GOVERNMENT_ID', now(), now()),
      ('integrity-legacy-address', $1, 'integrity-property', 'OWNERSHIP', $4,
       'APPROVED', now(), 'PROPERTY_ADDRESS_PROOF', now(), now())
  `, [
    ids.seller,
    `${ids.seller}/legacy-evidence.pdf`,
    `${ids.seller}/legacy-id.pdf`,
    `${ids.seller}/legacy-address.pdf`,
  ]);
}

async function assertLegacyEvidenceReopened(db) {
  const result = await db.query(`
    SELECT
      (SELECT count(*) = 3 FROM public."VerificationDocument"
       WHERE "propertyId" = property.id
         AND "documentType" = 'OWNERSHIP'
         AND "reviewStatus" = 'PENDING'
         AND "propertyOwnershipVersion" IS NULL) AS all_evidence_quarantined,
      (SELECT count(*) = 2 FROM public."VerificationDocument"
       WHERE "propertyId" = property.id
         AND "ownershipEvidenceKind" IS NOT NULL) AS typed_kinds_preserved,
      property."ownershipVerificationStatus" = 'PENDING' AS property_pending,
      (SELECT count(*) = 3 FROM public."AdminAuditLog"
        WHERE action = 'legacy_ownership_evidence_quarantined'
          AND "targetType" = 'document'
          AND metadata->>'propertyId' = property.id) AS prior_decisions_audited,
      EXISTS (
        SELECT 1 FROM public."AdminAuditLog"
        WHERE action = 'legacy_property_ownership_reopened'
          AND "targetId" = property.id
          AND metadata->>'previousStatus' = 'APPROVED'
      ) AS prior_property_status_audited
    FROM public."SellerProperty" AS property
    WHERE property.id = 'integrity-property'
  `);
  const row = result.rows[0];
  if (!Object.values(row ?? {}).every(Boolean)) {
    throw new Error(`Legacy evidence was not safely reopened: ${JSON.stringify(row)}`);
  }
  return row;
}

async function assertVersionedOwnership(db) {
  await db.query(`
    UPDATE public."SellerProperty"
    SET "addressLine1" = '456 Current St', "updatedAt" = now()
    WHERE id = 'integrity-property'
  `);
  const changed = await db.query(`
    SELECT "ownershipVersion", "ownershipVerificationStatus"
    FROM public."SellerProperty" WHERE id = 'integrity-property'
  `);
  if (changed.rows[0]?.ownershipVersion !== 2 || changed.rows[0]?.ownershipVerificationStatus !== "PENDING") {
    throw new Error(`Ownership edit did not invalidate approval: ${JSON.stringify(changed.rows[0])}`);
  }

  await expectPgError(
    () => db.query(
      'UPDATE public."SellerProperty" SET "ownerUserId" = $1, "updatedAt" = now() WHERE id = \'integrity-property\'',
      [ids.otherSeller],
    ),
    "23514",
    "LIBER_PROPERTY_OWNER_IMMUTABLE",
  );

  await expectPgError(
    () => insertOwnershipEvidence(db, "integrity-wrong-version", "GOVERNMENT_ID", 1),
    "23514",
    "LIBER_OWNERSHIP_EVIDENCE_VERSION_MISMATCH",
  );
  await expectPgError(
    () => insertOwnershipEvidence(db, "integrity-wrong-owner", "GOVERNMENT_ID", 2, ids.otherSeller),
    "23514",
    "LIBER_OWNERSHIP_EVIDENCE_VERSION_MISMATCH",
  );
  await insertOwnershipEvidence(db, "integrity-id-v2", "GOVERNMENT_ID", 2);
  await insertOwnershipEvidence(db, "integrity-address-v2", "PROPERTY_ADDRESS_PROOF", 2);
  await db.query(`
    UPDATE public."SellerProperty"
    SET "ownershipVerificationStatus" = 'APPROVED', "updatedAt" = now()
    WHERE id = 'integrity-property'
  `);
  await db.query(`
    UPDATE public."SellerProperty"
    SET zip = '90002', "updatedAt" = now()
    WHERE id = 'integrity-property'
  `);
  await expectPgError(
    () => db.query(`
      UPDATE public."SellerProperty"
      SET "ownershipVerificationStatus" = 'APPROVED', "updatedAt" = now()
      WHERE id = 'integrity-property'
    `),
    "23514",
    "LIBER_PROPERTY_OWNERSHIP_EVIDENCE_INCOMPLETE",
  );

  const result = await db.query(`
    SELECT
      property."ownershipVersion" = 3 AS version_incremented,
      property."ownershipVerificationStatus" = 'PENDING' AS approval_invalidated,
      (SELECT count(*)::int FROM public."VerificationDocument"
       WHERE "propertyId" = property.id
         AND "propertyOwnershipVersion" = 2
         AND "reviewStatus" = 'APPROVED') = 2 AS prior_evidence_preserved
    FROM public."SellerProperty" AS property
    WHERE property.id = 'integrity-property'
  `);
  const row = result.rows[0];
  if (!Object.values(row ?? {}).every(Boolean)) {
    throw new Error(`Versioned ownership assertions failed: ${JSON.stringify(row)}`);
  }
  return row;
}

async function insertOwnershipEvidence(db, id, kind, version, userId = ids.seller, reviewStatus = "APPROVED") {
  return db.query(
    `INSERT INTO public."VerificationDocument" (
       id, "userId", "propertyId", "documentType", "storagePath",
       "reviewStatus", "ownershipEvidenceKind", "propertyOwnershipVersion",
       "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'integrity-property', 'OWNERSHIP', $3, $6, $4, $5, now(), now())`,
    [id, userId, `${userId}/${id}.pdf`, kind, version, reviewStatus],
  );
}

async function assertConcurrentDocumentReview(db) {
  await insertOwnershipEvidence(
    db,
    "integrity-review-race",
    "GOVERNMENT_ID",
    3,
    ids.seller,
    "PENDING",
  );
  const first = new pg.Client({ connectionString: testUrl });
  const second = new pg.Client({ connectionString: testUrl });
  await Promise.all([first.connect(), second.connect()]);
  try {
    const reviews = await Promise.all([
      first.query(`
        UPDATE public."VerificationDocument"
        SET "reviewStatus" = 'APPROVED', "updatedAt" = now()
        WHERE id = 'integrity-review-race' AND "reviewStatus" = 'PENDING'
        RETURNING id
      `),
      second.query(`
        UPDATE public."VerificationDocument"
        SET "reviewStatus" = 'REJECTED', "updatedAt" = now()
        WHERE id = 'integrity-review-race' AND "reviewStatus" = 'PENDING'
        RETURNING id
      `),
    ]);
    const counts = reviews.map((review) => review.rowCount).sort();
    if (JSON.stringify(counts) !== JSON.stringify([0, 1])) {
      throw new Error(`Document review was not one-winner: ${JSON.stringify(counts)}`);
    }
    return { oneWinner: true, updateCounts: counts };
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function assertInviteGuards(db) {
  await expectPgError(
    () => insertInvite(db, "integrity-wrong-owner", ids.otherSeller, "integrity-buyer"),
    "P0001",
    "Seller must own property",
  );
  await expectPgError(
    () => insertInvite(db, "integrity-self-invite", ids.seller, "integrity-self-buyer"),
    "P0001",
    "Sellers cannot invite their own buyer profile",
  );
  return { exactSellerOwnership: true, selfInviteDenied: true };
}

async function assertInviteExpiryAtUse(db) {
  await insertInvite(db, "integrity-expiring", ids.seller, "integrity-buyer");
  await db.query(`
    UPDATE public."Invite"
    SET "sentAt" = now() - interval '2 days',
        "expiresAt" = now() - interval '1 second',
        status = 'SENT',
        "updatedAt" = now()
    WHERE id = 'integrity-expiring'
  `);
  const expiredResponse = await db.query(`
    UPDATE public."Invite"
    SET status = 'ACCEPTED', "respondedAt" = clock_timestamp(), "updatedAt" = clock_timestamp()
    WHERE id = 'integrity-expiring'
      AND status IN ('SENT', 'VIEWED')
      AND "expiresAt" > clock_timestamp()
    RETURNING id
  `);
  if (expiredResponse.rowCount !== 0) throw new Error("Expired invite accepted a response.");
  await insertInvite(db, "integrity-after-expiry", ids.seller, "integrity-buyer");
  await expectPgError(
    () => db.query(`
      INSERT INTO public."Invite" (
        id, "sellerId", "buyerProfileId", "propertyId", title, message,
        "sentAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        'integrity-invalid-expiry', $1, 'integrity-buyer-2', 'integrity-property',
        'Invalid expiry', 'Invalid expiry', now() + interval '2 days',
        now() + interval '1 day', now(), now()
      )
    `, [ids.seller]),
    "23514",
    "Invite_expiresAt_after_sentAt_check",
  );
  const result = await db.query(`
    SELECT
      (SELECT status = 'EXPIRED' FROM public."Invite" WHERE id = 'integrity-expiring') AS stale_rejected,
      (SELECT status = 'SENT' FROM public."Invite" WHERE id = 'integrity-after-expiry') AS replacement_active
  `);
  const row = result.rows[0];
  if (!row?.stale_rejected || !row?.replacement_active) {
    throw new Error(`Invite expiry was not enforced at use time: ${JSON.stringify(row)}`);
  }
  return { ...row, expired_response_updates: expiredResponse.rowCount };
}

async function assertConcurrentDuplicateInvite(db) {
  const first = new pg.Client({ connectionString: testUrl });
  const second = new pg.Client({ connectionString: testUrl });
  await Promise.all([first.connect(), second.connect()]);
  try {
    const results = await Promise.allSettled([
      insertInvite(first, "integrity-race-1", ids.seller, "integrity-buyer-2"),
      insertInvite(second, "integrity-race-2", ids.seller, "integrity-buyer-2"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    const rejected = results.filter(
      (result) => result.status === "rejected" && result.reason?.code === "23505",
    ).length;
    const count = await db.query(`
      SELECT count(*)::int AS active_count
      FROM public."Invite"
      WHERE "sellerId" = $1
        AND "buyerProfileId" = 'integrity-buyer-2'
        AND "propertyId" = 'integrity-property'
        AND status IN ('SENT', 'VIEWED')
    `, [ids.seller]);
    if (fulfilled !== 1 || rejected !== 1 || count.rows[0]?.active_count !== 1) {
      throw new Error(`Concurrent duplicate invite was not serialized: ${JSON.stringify({ count: count.rows[0], fulfilled, rejected })}`);
    }
    return { activeCount: 1, oneConflict: true, oneCreated: true };
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function insertInvite(db, id, sellerId, buyerProfileId) {
  return db.query(
    `INSERT INTO public."Invite" (
       id, "sellerId", "buyerProfileId", "propertyId", title, message,
       "sentAt", "expiresAt", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, 'integrity-property', 'Integrity invite', 'Integrity invite',
       now(), now() + interval '30 days', now(), now())`,
    [id, sellerId, buyerProfileId],
  );
}

async function expectPgError(operation, expectedCode, expectedText) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === expectedCode && String(error.message).includes(expectedText)) return;
    throw new Error(
      `Expected PostgreSQL ${expectedCode} containing ${expectedText}, received ${error?.code}: ${error?.message}`,
      { cause: error },
    );
  }
  throw new Error(`Expected PostgreSQL ${expectedCode} containing ${expectedText}.`);
}

async function assertDisposableDatabase(url) {
  const sentinel = process.env.SELLER_PROPERTY_INTEGRITY_TEST_SENTINEL;
  if (
    !url ||
    !sentinel ||
    sentinel.length < 16 ||
    process.env.SELLER_PROPERTY_INTEGRITY_TEST_ALLOW_WRITES !== "true"
  ) {
    throw new Error("Set the seller-property database URL, write opt-in, and a 16+ character disposable sentinel.");
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && sameDatabaseTarget(sharedUrl, url)) {
      throw new Error("Refusing to run the destructive seller-property test against the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const result = await guard.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.seller_property_integrity_test_sentinel WHERE token = $1
       ) AS verified`,
      [sentinel],
    );
    if (!result.rows[0]?.verified) throw new Error("Disposable seller-property sentinel does not match.");
  } finally {
    await guard.end();
  }
}
