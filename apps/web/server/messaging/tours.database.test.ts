import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sameDatabaseTarget, supabaseProjectRef } from "../../../../scripts/database-target.mjs";

// Only session identity and the external email provider are controlled here.
// Prisma, PostgreSQL triggers, authorization reads, outbox writes and locks are real.
const mocks = vi.hoisted(() => ({ userId: "", send: vi.fn() }));
vi.mock("../session", () => ({ getSessionUser: vi.fn(async () => ({ id: mocks.userId })) }));
vi.mock("../email", () => ({ sendTourEmail: mocks.send }));
const databaseUrl = process.env.TOUR_DATABASE_TEST_URL;
const enabled = Boolean(databaseUrl && process.env.TOUR_DATABASE_TEST_SENTINEL && process.env.TOUR_DATABASE_TEST_ALLOW_WRITES === "true");
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: databaseUrl, max: 10 }) : null;
let tours: typeof import("./tours");
let messaging: typeof import("./service");
let prisma: (typeof import("@liber/db"))["prisma"];
type Fixture = { buyerId: string; sellerId: string; outsiderId: string; conversationId: string; inviteId: string; propertyId: string; pairKey: string };

suite("tour scheduling real PostgreSQL proof", () => {
  beforeAll(async () => {
    await assertDisposable();
    ({ prisma } = await import("@liber/db"));
    [tours, messaging] = await Promise.all([import("./tours"), import("./service")]);
    mocks.send.mockResolvedValue({ provider: "mock", queued: false });
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); });

  it("persists proposal, idempotent retry, other-party confirmation, reminders and cancellation", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.sellerId;
    const input = proposal();
    await tours.mutateConversationTour(fixture.conversationId, input);
    await tours.mutateConversationTour(fixture.conversationId, input);
    const current = await prisma.tourSchedule.findUniqueOrThrow({ where: { conversationId: fixture.conversationId } });
    expect(await prisma.emailOutbox.count({ where: { tourScheduleId: current.id } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: fixture.conversationId, kind: "SYSTEM" } })).toBe(1);
    await expect(tours.mutateConversationTour(fixture.conversationId, { action: "CONFIRM", expectedRevision: 1, clientActionId: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    mocks.userId = fixture.buyerId;
    await tours.mutateConversationTour(fixture.conversationId, { action: "CONFIRM", expectedRevision: 1, clientActionId: randomUUID() });
    expect(await prisma.emailOutbox.count({ where: { tourScheduleId: current.id, status: "PENDING" } })).toBe(5);
    expect(await prisma.emailOutbox.count({ where: { tourScheduleId: current.id, status: "CANCELLED" } })).toBe(1);
    await tours.mutateConversationTour(fixture.conversationId, { action: "CANCEL", expectedRevision: 2, clientActionId: randomUUID() });
    expect(await prisma.emailOutbox.count({ where: { tourScheduleId: current.id, status: "PENDING" } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { tourScheduleId: current.id, status: "CANCELLED" } })).toBe(6);
    expect(await tours.getConversationTour(fixture.conversationId)).toMatchObject({ schedule: { status: "CANCELLED", revision: 3 } });
  }, 30_000);

  it("rejects outsider access and blocks scheduling after a participant blocks the other", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.outsiderId;
    await expect(tours.getConversationTour(fixture.conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(tours.mutateConversationTour(fixture.conversationId, proposal())).rejects.toMatchObject({ status: 404 });
    mocks.userId = fixture.buyerId;
    await messaging.blockConversationUser({ conversationId: fixture.conversationId });
    await expect(tours.mutateConversationTour(fixture.conversationId, proposal())).rejects.toMatchObject({ code: "UNAVAILABLE" });
  }, 30_000);

  it("enforces participant foreign keys, shape, content-free outbox and raw-role denial", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.sellerId;
    await tours.mutateConversationTour(fixture.conversationId, proposal());
    const current = await prisma.tourSchedule.findUniqueOrThrow({ where: { conversationId: fixture.conversationId } });
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await expectPgError(client, () => client.query('UPDATE public."TourSchedule" SET "proposedByUserId"=$1::uuid WHERE id=$2::uuid', [fixture.outsiderId, current.id]), "23503");
      await expectPgError(client, () => client.query('UPDATE public."TourSchedule" SET status=\'OTHER\' WHERE id=$1::uuid', [current.id]), "23514");
      await expectPgError(client, () => client.query('UPDATE public."TourSchedule" SET "durationMinutes"=1 WHERE id=$1::uuid', [current.id]), "23514");
      await expectPgError(client, () => client.query('UPDATE public."EmailOutbox" SET payload=\'{"private":"text"}\'::jsonb WHERE "tourScheduleId"=$1::uuid', [current.id]), "23514");
      await expectPgError(client, () => client.query('UPDATE public."EmailOutbox" SET "tourRevision"=NULL WHERE "tourScheduleId"=$1::uuid', [current.id]), "23514");
      const security = await client.query(`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public."TourSchedule"'::regclass`);
      expect(security.rows[0].enabled).toBe(true);
      for (const role of ["anon", "authenticated", "service_role"]) {
        await expectPgError(client, async () => {
          await client.query(`SET LOCAL ROLE ${role}`);
          await client.query('SELECT * FROM public."TourSchedule"');
        }, "42501");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  }, 30_000);

  it("serializes simultaneous confirmation and cancellation with exactly one winner", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.sellerId;
    await tours.mutateConversationTour(fixture.conversationId, proposal());
    mocks.userId = fixture.buyerId;
    const blocker = await holdPair(fixture.pairKey);
    const results = Promise.allSettled(["CONFIRM", "CANCEL"].map((action) => tours.mutateConversationTour(fixture.conversationId, { action, expectedRevision: 1, clientActionId: randomUUID() })));
    try { await waitForWaiters(2); } finally { await blocker.release(); }
    const settled = await results;
    expect(settled.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((row) => row.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("CONFLICT");
    expect((await prisma.tourSchedule.findUniqueOrThrow({ where: { conversationId: fixture.conversationId } })).revision).toBe(2);
    expect(await prisma.message.count({ where: { conversationId: fixture.conversationId, kind: "SYSTEM" } })).toBe(2);
  }, 30_000);

  it("cancels a claimed notification if cancellation takes the pair lock before dispatch", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.sellerId;
    await tours.mutateConversationTour(fixture.conversationId, proposal());
    const schedule = await prisma.tourSchedule.findUniqueOrThrow({ where: { conversationId: fixture.conversationId } });
    const pending = await prisma.emailOutbox.findFirstOrThrow({ where: { tourScheduleId: schedule.id } });
    const job = await prisma.emailOutbox.update({ where: { id: pending.id }, data: { status: "SENDING", lockedAt: new Date(), leaseUntil: new Date(Date.now() + 120_000), workerId: "tour-proof" } });
    mocks.userId = fixture.buyerId; mocks.send.mockClear();
    const blocker = await holdPair(fixture.pairKey);
    const cancel = tours.mutateConversationTour(fixture.conversationId, { action: "CANCEL", expectedRevision: 1, clientActionId: randomUUID() });
    let dispatch: ReturnType<typeof tours.sendCurrentTourEmail> | null = null;
    try {
      await waitForWaiters(1);
      dispatch = tours.sendCurrentTourEmail(job, "tour-proof");
      await waitForWaiters(2);
    } finally { await blocker.release(); }
    await cancel;
    expect(await dispatch).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
  }, 30_000);

  it("calls the provider only after the delivery decision commits and releases the pair lock", async () => {
    const fixture = await seedFixture(); enablePair(fixture); mocks.userId = fixture.sellerId;
    await tours.mutateConversationTour(fixture.conversationId, proposal());
    const schedule = await prisma.tourSchedule.findUniqueOrThrow({ where: { conversationId: fixture.conversationId } });
    const pending = await prisma.emailOutbox.findFirstOrThrow({ where: { tourScheduleId: schedule.id } });
    const job = await prisma.emailOutbox.update({ where: { id: pending.id }, data: { status: "SENDING", lockedAt: new Date(), leaseUntil: new Date(Date.now() + 120_000), workerId: "tour-proof" } });
    let pairLockHeldDuringSend: boolean | null = null;
    mocks.send.mockImplementationOnce(async () => {
      // A bigint advisory key appears in pg_locks as classid (high half) and objid (low half).
      const held = await pool!.query(`SELECT EXISTS (
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND objsubid = 1 AND granted
            AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)
        ) AS held`, [fixture.pairKey]);
      pairLockHeldDuringSend = held.rows[0].held;
      return { provider: "mock", queued: false };
    });
    await expect(tours.sendCurrentTourEmail(job, "tour-proof")).resolves.toMatchObject({ provider: "mock" });
    expect(pairLockHeldDuringSend).toBe(false);
  }, 30_000);
});

function proposal() { return { action: "PROPOSE", clientActionId: randomUUID(), expectedRevision: 0, startsAt: new Date(Date.now() + 86_400_000).toISOString(), timeZone: "America/Los_Angeles", durationMinutes: 60 }; }
function enablePair(fixture: Fixture) { process.env.LIBER_TOUR_REMINDERS_ENABLED = "true"; process.env.LIBER_MESSAGING_V1_ENABLED = "true"; process.env.LIBER_MESSAGING_V1_COHORT_USER_IDS = `${fixture.buyerId},${fixture.sellerId}`; }
async function expectPgError(client: pg.PoolClient, operation: () => Promise<unknown>, expected: string) {
  await client.query("SAVEPOINT invalid_tour"); let code;
  try { await operation(); } catch (error) { code = (error as { code?: string }).code; }
  finally { await client.query("ROLLBACK TO SAVEPOINT invalid_tour"); await client.query("RELEASE SAVEPOINT invalid_tour"); }
  expect(code).toBe(expected);
}
async function holdPair(key: string) {
  const client = await pool!.connect();
  await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
  return { release: async () => { try { await client.query("COMMIT"); } finally { client.release(); } } };
}
async function waitForWaiters(count: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool!.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event='advisory'");
    if (result.rows[0].count >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Tour proof did not observe expected concurrent pair-lock waiters.");
}
async function assertDisposable() {
  const shared = JSON.parse(process.env.TOUR_DATABASE_TEST_SHARED_URLS ?? "[]");
  if (!databaseUrl || !process.env.TOUR_DATABASE_TEST_SENTINEL || process.env.TOUR_DATABASE_TEST_SENTINEL.length < 16
    || !Array.isArray(shared) || shared.length < 2 || shared.some((url) => typeof url !== "string" || sameDatabaseTarget(url, databaseUrl))
    || supabaseProjectRef(databaseUrl) === "qfjcrhkjlczvzakxives") throw new Error("Tour proof requires a marked disposable target and shared-target deny URLs.");
  const sentinel = await pool!.query("SELECT EXISTS(SELECT 1 FROM public.tour_database_test_sentinel WHERE token=$1) AS verified", [process.env.TOUR_DATABASE_TEST_SENTINEL]);
  if (!sentinel.rows[0]?.verified) throw new Error("Disposable tour sentinel mismatch.");
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const buyerId = randomUUID();
  const sellerId = randomUUID();
  const outsiderId = randomUUID();
  const marketId = randomUUID();
  const serviceAreaId = randomUUID();
  const buyerProfileId = `tour-buyer-${suffix}`;
  const propertyId = `tour-property-${suffix}`;
  const inviteId = `tour-invite-${suffix}`;

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    for (const [id, email, name] of [
      [buyerId, `tour-buyer-${suffix}@example.invalid`, "Tour Buyer"],
      [sellerId, `tour-seller-${suffix}@example.invalid`, "Tour Seller"],
      [outsiderId, `tour-outsider-${suffix}@example.invalid`, "Tour Outsider"],
    ]) {
      await client.query(`INSERT INTO auth.users (
          id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES ($1::uuid, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
      [id, email, name]);
    }
    await client.query(`UPDATE public."User"
      SET name = CASE id WHEN $1::uuid THEN 'Tour Buyer' WHEN $2::uuid THEN 'Tour Seller' ELSE 'Tour Outsider' END,
          roles = CASE id WHEN $2::uuid THEN ARRAY['SELLER']::public."UserRole"[] ELSE ARRAY['BUYER']::public."UserRole"[] END,
          status = 'ACTIVE'
      WHERE id = ANY($3::uuid[])`, [buyerId, sellerId, [buyerId, sellerId, outsiderId]]);
    await client.query(`INSERT INTO public."SellerAccess" (id, "userId", status, "reviewedAt", "createdAt", "updatedAt")
      VALUES ($1, $2::uuid, 'APPROVED', now(), now(), now())`, [`tour-access-${suffix}`, sellerId]);
    await client.query(`INSERT INTO public.markets (
        id, slug, label, state, country, center_lat, center_lng,
        bbox_west, bbox_south, bbox_east, bbox_north, active, created_at, updated_at
      ) VALUES ($1::uuid, $2, 'Tour Test Market', 'CA', 'US', 34.1, -118.3,
        -118.6, 33.9, -118.0, 34.4, true, now(), now())`, [marketId, `tour-${suffix}`]);
    await client.query(`INSERT INTO public.service_areas (
        id, market_id, slug, label, type, postal_code, city, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, source, source_version, search_terms, active, is_pilot,
        created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3, '90001', 'zip', '90001', 'Los Angeles', 'CA',
        34.1, -118.3, -118.4, 34.0, -118.2, 34.2,
        $4, 'tour-behavior-test', '1', ARRAY[$3, '90001'], true, false, now(), now())`,
    [serviceAreaId, marketId, `tour-area-${suffix}`, `/tour/${suffix}.geojson`]);
    await client.query(`INSERT INTO public."BuyerProfile" (
        id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, 'Tour Buyer', 'DRAFT', now(), now())`, [buyerProfileId, buyerId]);
    await client.query(`INSERT INTO public."BuyerCriteria" (
        id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`, [`tour-criteria-${suffix}`, buyerProfileId]);
    await client.query(`INSERT INTO public.buyer_desired_service_areas (
        buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
      ) VALUES ($1, $2::uuid, 'SELECTED', true, now(), now())`, [buyerProfileId, serviceAreaId]);
    await client.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now() WHERE id = $1`, [buyerProfileId]);
    await client.query(`INSERT INTO public."SellerProperty" (
        id, "ownerUserId", "addressLine1", city, state, zip, "propertyType", features, price,
        "ownershipVerificationStatus", status, "identityVersion", "authorityAttestedAt",
        "authorityAttestedByUserId", "attestationVersion", "authorityAttestedIdentityVersion",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, '100 Tour Proof Way', 'Los Angeles', 'CA', '90001', 'HOME', ARRAY[]::text[], 1000000,
        'APPROVED', 'READY_FOR_INVITES', 1, now(), $2::uuid, 'tour-behavior-v1', 1, now(), now())`,
    [propertyId, sellerId]);
    await client.query(`INSERT INTO public."Invite" (
        id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion", title, message,
        "openingTemplateKey", "openingTemplateVersion", status, "sentAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, $3, $4, 1, 'Tour proof invite', 'Would you like more photos or property details?',
        'SELLER_MORE_DETAILS', 1, 'SENT', now(), now() + interval '30 days', now(), now())`,
    [inviteId, sellerId, buyerProfileId, propertyId]);
    await client.query(`UPDATE public."Invite"
      SET status = 'ACCEPTED', "viewedAt" = now(), "respondedAt" = now(), "updatedAt" = now()
      WHERE id = $1`, [inviteId]);
    const conversation = await client.query(`SELECT id FROM public."Conversation" WHERE "inviteId" = $1`, [inviteId]);
    if (conversation.rowCount !== 1) throw new Error("Tour fixture conversation was not created.");
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("COMMIT");
    return {
      buyerId,
      conversationId: conversation.rows[0].id,
      inviteId,
      outsiderId,
      pairKey: `messaging-pair:${[buyerId, sellerId].sort().join(":")}`,
      propertyId,
      sellerId,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
