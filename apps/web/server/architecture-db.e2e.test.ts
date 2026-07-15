import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.SERVICE_AREA_E2E_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.SERVICE_AREA_E2E_ALLOW_WRITES === "true");
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: databaseUrl, max: 8 }) : null;

const ownerId = randomUUID();
const buyerUserId = randomUUID();
const outsiderId = randomUUID();
const buyerProfileId = `buyer_${randomUUID()}`;
const propertyId = `property_${randomUUID()}`;
const imagePath = `${propertyId}/test/image.jpg`;

suite("architecture database boundaries", () => {
  beforeAll(async () => {
    const authSentinel = process.env.AUTH_SECURITY_STAGING_SENTINEL;
    const sentinel = authSentinel ?? process.env.GEOGRAPHY_MIGRATION_TEST_SENTINEL;
    const guard = authSentinel
      ? await pool!.query(`
          SELECT to_regclass('public.identity_migration_test_sentinel') IS NOT NULL AS present,
            EXISTS (SELECT 1 FROM public.identity_migration_test_sentinel WHERE token = $1) AS verified
        `, [sentinel])
      : await pool!.query(`
          SELECT to_regclass('public.geography_migration_test_sentinel') IS NOT NULL AS present,
            EXISTS (SELECT 1 FROM public.geography_migration_test_sentinel WHERE token = $1) AS verified
        `, [sentinel]);
    if (!guard.rows[0]?.present || !guard.rows[0]?.verified) throw new Error("Disposable database sentinel is missing.");

    for (const [id, email] of [
      [ownerId, `${ownerId}@example.test`],
      [buyerUserId, `${buyerUserId}@example.test`],
      [outsiderId, `${outsiderId}@example.test`],
    ]) {
      await pool!.query(`INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ($1, $2, '{}'::jsonb, '{}'::jsonb, now(), now())`, [id, email]);
    }
    await pool!.query(`UPDATE public."User" SET roles = ARRAY['SELLER']::public."UserRole"[] WHERE id = $1`, [ownerId]);
    await pool!.query(`UPDATE public."User" SET roles = ARRAY['BUYER']::public."UserRole"[] WHERE id = $1`, [buyerUserId]);
    await pool!.query(`INSERT INTO public."SellerAccess" (id, "userId", status, "createdAt", "updatedAt")
      VALUES ($1, $2, 'APPROVED', now(), now())`, [`access_${randomUUID()}`, ownerId]);
    const area = await pool!.query(`SELECT area.id FROM public.service_areas area JOIN public.markets market ON market.id = area.market_id
      WHERE area.active = true AND market.active = true LIMIT 1`);
    const transaction = await pool!.connect();
    await transaction.query("BEGIN");
    try {
      await transaction.query(`INSERT INTO public."BuyerProfile" (id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt")
        VALUES ($1, $2, 'Architecture Buyer', 'DRAFT', now(), now())`, [buyerProfileId, buyerUserId]);
      await transaction.query(`INSERT INTO public."BuyerCriteria" (id, "buyerProfileId", "propertyCategory", "propertySubtype", "createdAt", "updatedAt")
        VALUES ($1, $2, 'HOME', 'HOME', now(), now())`, [`criteria_${randomUUID()}`, buyerProfileId]);
      await transaction.query(`INSERT INTO public.buyer_desired_service_areas
        (buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at)
        VALUES ($1, $2, 'SELECTED', true, now(), now())`, [buyerProfileId, area.rows[0].id]);
      await transaction.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = $1`, [buyerProfileId]);
      await transaction.query("COMMIT");
    } catch (error) {
      await transaction.query("ROLLBACK");
      throw error;
    } finally {
      transaction.release();
    }
    await pool!.query(`INSERT INTO public."SellerProperty"
      (id, "ownerUserId", "propertyType", "ownershipVerificationStatus", status, "identityVersion",
       "authorityAttestedAt", "authorityAttestedByUserId", "authorityAttestedIdentityVersion", "attestationVersion",
       "createdAt", "updatedAt")
      VALUES ($1, $2, 'HOME', 'APPROVED', 'READY_FOR_INVITES', 1, now(), $2, 1, 'architecture-e2e', now(), now())`, [propertyId, ownerId]);
    await pool!.query(`INSERT INTO public."PropertyImage"
      (id, "propertyId", "propertyIdentityVersion", "storagePath", "sortOrder", "createdAt")
      VALUES ($1, $2, 1, $3, 0, now())`, [`image_${randomUUID()}`, propertyId, imagePath]);
    await pool!.query(`INSERT INTO public."Invite"
      (id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion", title, message, status, "sentAt", "expiresAt", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 1, 'Test', 'Test', 'SENT', now(), now() + interval '1 day', now(), now())`,
      [`invite_${randomUUID()}`, ownerId, buyerProfileId, propertyId]);
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM public."EmailOutbox" WHERE "idempotencyKey" LIKE 'architecture-e2e:%'`);
    await pool.query(`DELETE FROM public."RateLimitBucket" WHERE key LIKE 'architecture-e2e:%'`);
    await pool.query(`DELETE FROM public."User" WHERE id = ANY($1::uuid[])`, [[ownerId, buyerUserId, outsiderId]]);
    await pool.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [[ownerId, buyerUserId, outsiderId]]);
    await pool.end();
  });

  it("authorizes private property images only for owner or active invited buyer", async () => {
    const result = await pool!.query(`SELECT
      app_private.can_read_property_image($1, $2) AS owner,
      app_private.can_read_property_image($1, $3) AS buyer,
      app_private.can_read_property_image($1, $4) AS outsider,
      app_private.is_invite_deliverable((SELECT id FROM public."Invite" WHERE "propertyId" = $5)) AS deliverable`,
      [imagePath, ownerId, buyerUserId, outsiderId, propertyId]);
    expect(result.rows[0]).toEqual({ owner: true, buyer: true, outsider: false, deliverable: true });
    await pool!.query(`UPDATE public."Invite" SET "expiresAt" = now() - interval '1 minute' WHERE "propertyId" = $1`, [propertyId]);
    const expired = await pool!.query(`SELECT app_private.can_read_property_image($1, $2) AS allowed`, [imagePath, buyerUserId]);
    expect(expired.rows[0].allowed).toBe(false);
    await pool!.query(`UPDATE public."Invite" SET status = 'ACCEPTED' WHERE "propertyId" = $1`, [propertyId]);
    const accepted = await pool!.query(`SELECT app_private.can_read_property_image($1, $2) AS allowed`, [imagePath, buyerUserId]);
    expect(accepted.rows[0].allowed).toBe(true);
    await pool!.query(`UPDATE public."User" SET status = 'SUSPENDED' WHERE id = $1`, [buyerUserId]);
    const suspended = await pool!.query(`SELECT app_private.can_read_property_image($1, $2) AS allowed`, [imagePath, buyerUserId]);
    expect(suspended.rows[0].allowed).toBe(false);
    await pool!.query(`UPDATE public."User" SET status = 'ACTIVE' WHERE id = $1`, [buyerUserId]);
    await pool!.query(`UPDATE public."SellerProperty" SET "addressLine1" = 'Changed identity' WHERE id = $1`, [propertyId]);
    const changed = await pool!.query(`SELECT
      property."identityVersion", property."authorityAttestedIdentityVersion", invite.status,
      app_private.can_read_property_image($2, $3) AS allowed
      FROM public."SellerProperty" property
      JOIN public."Invite" invite ON invite."propertyId" = property.id
      WHERE property.id = $1`, [propertyId, imagePath, buyerUserId]);
    expect(changed.rows[0]).toMatchObject({
      allowed: false,
      authorityAttestedIdentityVersion: null,
      identityVersion: 2,
      status: "WITHDRAWN",
    });
  });

  it("consumes a shared rate limit atomically across connections", async () => {
    const key = `architecture-e2e:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      pool!.query(`SELECT allowed FROM app_private.consume_rate_limit($1, 4, 60000)`, [key]),
    ));
    expect(results.filter((result) => result.rows[0].allowed).length).toBe(4);
  });

  it("claims each outbox row once across concurrent workers", async () => {
    const { claimEmailJobs } = await import("./email-outbox");
    const ids = Array.from({ length: 4 }, () => `email_${randomUUID()}`);
    for (const id of ids) {
      await pool!.query(`INSERT INTO public."EmailOutbox"
        (id, type, "to", payload, status, attempts, "idempotencyKey", "createdAt", "updatedAt")
        VALUES ($1, 'INVITE', 'buyer@example.test', '{}'::jsonb, 'PENDING', 0, $2, now(), now())`,
        [id, `architecture-e2e:${id}`]);
    }
    const [first, second] = await Promise.all([
      claimEmailJobs(4, "architecture-worker-a"),
      claimEmailJobs(4, "architecture-worker-b"),
    ]);
    const claimed = [...first, ...second].filter((job) => ids.includes(job.id));
    expect(new Set(claimed.map((job) => job.id)).size).toBe(4);
    expect(claimed).toHaveLength(4);
  });
});
