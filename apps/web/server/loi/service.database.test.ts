import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LoiTermsV1 } from "@liber/validators";
import { sameDatabaseTarget } from "../../../../scripts/database-target.mjs";

const mocks = vi.hoisted(() => ({ role: "BUYER", userId: "" }));
vi.mock("../session", () => ({
  getSessionUser: vi.fn(async () => ({ id: mocks.userId, roles: [mocks.role] })),
}));
vi.mock("../shared-rate-limit", () => ({
  consumeSharedRateLimit: vi.fn(async () => ({ allowed: true, remaining: 100 })),
}));

const databaseUrl = process.env.LOI_BEHAVIOR_TEST_DATABASE_URL;
const enabled = Boolean(
  databaseUrl
  && process.env.LOI_BEHAVIOR_TEST_ALLOW_WRITES === "true"
  && process.env.LOI_BEHAVIOR_TEST_SENTINEL,
);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: databaseUrl, max: 10 }) : null;

let loi: typeof import("./service");
let messaging: typeof import("../messaging/service");
let maintenance: typeof import("../maintenance");
let prisma: (typeof import("@liber/db"))["prisma"];

type Fixture = {
  buyerId: string;
  conversationId: string;
  inviteId: string;
  outsiderId: string;
  pairKey: string;
  propertyId: string;
  sellerId: string;
};

suite("LOI service PostgreSQL lifecycle and races", () => {
  beforeAll(async () => {
    await assertDisposableTarget();
    ({ prisma } = await import("@liber/db"));
    [loi, messaging, maintenance] = await Promise.all([
      import("./service"),
      import("../messaging/service"),
      import("../maintenance"),
    ]);
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("runs initial submission, alternating counter, and agreement with exact side effects", async () => {
    const fixture = await seedFixture();
    const created = await createNegotiation(fixture);
    const initial = await saveAndSubmit(fixture, created.starterTerms!, 0);

    asUser(fixture.sellerId, "SELLER");
    const counterTerms = structuredClone(initial.revisions.at(-1)!.terms);
    counterTerms.additionalTerms.proposedTerms = "Seller requests a shorter closing period.";
    const counter = await saveAndSubmit(fixture, counterTerms, 1);
    const current = counter.revisions.at(-1)!;

    asUser(fixture.buyerId, "BUYER");
    const agreementRequest = {
      action: "AGREE",
      clientActionId: randomUUID(),
      expectedSequence: 2,
      negotiationId: created.id,
      revisionId: current.id,
    } as const;
    const agreementResults = await runBehindPairBarrier(fixture.pairKey, [
      () => loi.decideLoiRevision(agreementRequest),
      () => loi.decideLoiRevision(agreementRequest),
    ]);
    expect(agreementResults.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    await expectLoiCode(
      loi.decideLoiRevision({ ...agreementRequest, action: "DECLINE" }),
      "CONFLICT",
    );
    const aligned = await loi.getLoiNegotiation(created.id);
    expect(aligned.status).toBe("TERMS_ALIGNED");

    const state = await negotiationState(created.id);
    expect(state).toMatchObject({
      events: 4,
      notifications: 3,
      outboxJobs: 3,
      revisions: 2,
      status: "TERMS_ALIGNED",
    });
    expect(state).toMatchObject({
      cancelledOutboxJobs: 2,
      pendingBuyerOutboxJobs: 0,
      pendingOutboxJobs: 1,
      pendingSellerOutboxJobs: 1,
    });
  }, 60_000);

  it("declines the current revision with exact side effects", async () => {
    const fixture = await seedFixture();
    const created = await createNegotiation(fixture);
    const submitted = await saveAndSubmit(fixture, created.starterTerms!, 0);
    const revisionId = submitted.revisions.at(-1)!.id;

    asUser(fixture.sellerId, "SELLER");
    const declineRequest = {
      action: "DECLINE",
      clientActionId: randomUUID(),
      expectedSequence: 1,
      negotiationId: created.id,
      revisionId,
    } as const;
    const retryResults = await runBehindPairBarrier(fixture.pairKey, [
      () => loi.decideLoiRevision(declineRequest),
      () => loi.decideLoiRevision(declineRequest),
    ]);
    expect(retryResults.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const declined = retryResults.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value as Awaited<ReturnType<typeof loi.decideLoiRevision>>;
    });
    expect(declined[0]).toEqual(declined[1]);
    expect(declined[0].status).toBe("DECLINED");
    await expectLoiCode(
      loi.decideLoiRevision({ ...declineRequest, action: "AGREE" }),
      "CONFLICT",
    );

    expect(await negotiationState(created.id)).toMatchObject({
      cancelledOutboxJobs: 1,
      declinedEvents: 1,
      events: 3,
      notifications: 2,
      outboxJobs: 2,
      pendingBuyerOutboxJobs: 1,
      pendingOutboxJobs: 1,
      pendingSellerOutboxJobs: 0,
      revisions: 1,
      status: "DECLINED",
      submissionEvents: 1,
    });
  }, 60_000);

  it("supports pre-submit and post-submit withdrawal with exact idempotent retries", async () => {
    const beforeSubmit = await seedFixture();
    const createdBeforeSubmit = await createNegotiation(beforeSubmit);
    const preActionId = randomUUID();
    await loi.withdrawLoiNegotiation({
      clientActionId: preActionId,
      expectedSequence: 0,
      negotiationId: createdBeforeSubmit.id,
      revisionId: null,
    });
    await loi.withdrawLoiNegotiation({
      clientActionId: preActionId,
      expectedSequence: 0,
      negotiationId: createdBeforeSubmit.id,
      revisionId: null,
    });
    expect(await negotiationState(createdBeforeSubmit.id)).toMatchObject({
      events: 2,
      outboxJobs: 0,
      revisions: 0,
      status: "WITHDRAWN",
    });

    const afterSubmit = await seedFixture();
    const createdAfterSubmit = await createNegotiation(afterSubmit);
    const submitted = await saveAndSubmit(afterSubmit, createdAfterSubmit.starterTerms!, 0);
    const revisionId = submitted.revisions.at(-1)!.id;
    const withdrawActionId = randomUUID();
    const request = {
      clientActionId: withdrawActionId,
      expectedSequence: 1,
      negotiationId: createdAfterSubmit.id,
      revisionId,
    };
    await loi.withdrawLoiNegotiation(request);
    await loi.withdrawLoiNegotiation(request);
    await expectLoiCode(
      loi.withdrawLoiNegotiation({ ...request, expectedSequence: 0 }),
      "CONFLICT",
    );
    const state = await negotiationState(createdAfterSubmit.id);
    expect(state).toMatchObject({
      events: 3,
      notifications: 2,
      outboxJobs: 2,
      pendingOutboxJobs: 1,
      revisions: 1,
      status: "WITHDRAWN",
    });
  }, 60_000);

  it("rejects stale, expired, same-author, outsider, and changed idempotency requests", async () => {
    const fixture = await seedFixture();
    const created = await createNegotiation(fixture);
    const initialTerms = created.starterTerms!;
    const saved = await loi.saveLoiDraft({
      expectedDraftVersion: 0,
      expectedSequence: 0,
      negotiationId: created.id,
      terms: initialTerms,
    });
    await expectLoiCode(
      loi.saveLoiDraft({
        expectedDraftVersion: 0,
        expectedSequence: 0,
        negotiationId: created.id,
        terms: initialTerms,
      }),
      "CONFLICT",
    );
    const actionId = randomUUID();
    const deadline = futureDeadline(3);
    const request = {
      clientActionId: actionId,
      expectedDraftId: saved.draft!.id,
      expectedDraftVersion: saved.draft!.draftVersion,
      expectedSequence: 0,
      negotiationId: created.id,
      responseDeadline: deadline,
    };
    const retryResults = await runBehindPairBarrier(fixture.pairKey, [
      () => loi.submitLoiRevision(request),
      () => loi.submitLoiRevision(request),
    ]);
    expect(retryResults.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const [submitted, duplicate] = retryResults.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value as Awaited<ReturnType<typeof loi.submitLoiRevision>>;
    });
    expect(duplicate.revisions.at(-1)!.id).toBe(submitted.revisions.at(-1)!.id);
    expect(await negotiationState(created.id)).toMatchObject({
      notifications: 1,
      outboxJobs: 1,
      revisions: 1,
      submissionEvents: 1,
    });
    await expectLoiCode(
      loi.submitLoiRevision({ ...request, responseDeadline: futureDeadline(4) }),
      "CONFLICT",
    );
    await expectLoiCode(
      loi.saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 1, negotiationId: created.id, terms: initialTerms }),
      "UNAVAILABLE",
    );

    asUser(fixture.sellerId, "SELLER");
    await expectLoiCode(
      loi.saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 0, negotiationId: created.id, terms: initialTerms }),
      "CONFLICT",
    );

    asUser(fixture.outsiderId, "BUYER");
    await expectLoiCode(loi.getLoiNegotiation(created.id), "NOT_FOUND");
    await expectLoiCode(
      loi.withdrawLoiNegotiation({
        clientActionId: randomUUID(),
        expectedSequence: 1,
        negotiationId: created.id,
        revisionId: submitted.revisions.at(-1)!.id,
      }),
      "NOT_FOUND",
    );

    const expiredFixture = await seedFixture();
    const expiredCreated = await createNegotiation(expiredFixture);
    const expiredInitial = await saveAndSubmit(expiredFixture, expiredCreated.starterTerms!, 0);
    asUser(expiredFixture.sellerId, "SELLER");
    const expiringCounterTerms = structuredClone(expiredInitial.revisions.at(-1)!.terms);
    expiringCounterTerms.additionalTerms.proposedTerms = "Counter that will expire.";
    await saveAndSubmit(expiredFixture, expiringCounterTerms, 1);
    await maintenance.expireMarketplaceState(new Date(Date.now() + 4 * 60 * 60 * 1000));
    expect(await negotiationState(expiredCreated.id)).toMatchObject({
      expiredEvents: 1,
      revisions: 2,
      status: "EXPIRED",
    });
    asUser(expiredFixture.buyerId, "BUYER");
    await expectLoiCode(
      loi.saveLoiDraft({
        expectedDraftVersion: 0,
        expectedSequence: 2,
        negotiationId: expiredCreated.id,
        terms: expiredCreated.starterTerms!,
      }),
      "UNAVAILABLE",
    );
  }, 60_000);

  it("serializes simultaneous initial and counter submissions", async () => {
    const initialFixture = await seedFixture();
    const initialCreated = await createNegotiation(initialFixture);
    const saved = await loi.saveLoiDraft({
      expectedDraftVersion: 0,
      expectedSequence: 0,
      negotiationId: initialCreated.id,
      terms: initialCreated.starterTerms!,
    });
    const initialResults = await runBehindPairBarrier(initialFixture.pairKey, [
      () => loi.submitLoiRevision({
        clientActionId: randomUUID(),
        expectedDraftId: saved.draft!.id,
        expectedDraftVersion: saved.draft!.draftVersion,
        expectedSequence: 0,
        negotiationId: initialCreated.id,
        responseDeadline: futureDeadline(3),
      }),
      () => loi.submitLoiRevision({
        clientActionId: randomUUID(),
        expectedDraftId: saved.draft!.id,
        expectedDraftVersion: saved.draft!.draftVersion,
        expectedSequence: 0,
        negotiationId: initialCreated.id,
        responseDeadline: futureDeadline(3),
      }),
    ]);
    expect(initialResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await negotiationState(initialCreated.id)).toMatchObject({
      outboxJobs: 1,
      revisions: 1,
      submissionEvents: 1,
    });

    const counterFixture = await seedFixture();
    const counterCreated = await createNegotiation(counterFixture);
    const initial = await saveAndSubmit(counterFixture, counterCreated.starterTerms!, 0);
    asUser(counterFixture.sellerId, "SELLER");
    const counterTerms = structuredClone(initial.revisions.at(-1)!.terms);
    counterTerms.additionalTerms.proposedTerms = "Concurrent counter proof.";
    const counterDraft = await loi.saveLoiDraft({
      expectedDraftVersion: 0,
      expectedSequence: 1,
      negotiationId: counterCreated.id,
      terms: counterTerms,
    });
    const counterResults = await runBehindPairBarrier(counterFixture.pairKey, [
      () => loi.submitLoiRevision({
        clientActionId: randomUUID(),
        expectedDraftId: counterDraft.draft!.id,
        expectedDraftVersion: counterDraft.draft!.draftVersion,
        expectedSequence: 1,
        negotiationId: counterCreated.id,
        responseDeadline: futureDeadline(3),
      }),
      () => loi.submitLoiRevision({
        clientActionId: randomUUID(),
        expectedDraftId: counterDraft.draft!.id,
        expectedDraftVersion: counterDraft.draft!.draftVersion,
        expectedSequence: 1,
        negotiationId: counterCreated.id,
        responseDeadline: futureDeadline(3),
      }),
    ]);
    expect(counterResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await negotiationState(counterCreated.id)).toMatchObject({
      revisions: 2,
      submissionEvents: 2,
    });
  }, 60_000);

  it("serializes submit against participant blocking and expiry maintenance", async () => {
    const blockFixture = await seedFixture();
    const blockCreated = await createNegotiation(blockFixture);
    const blockDraft = await loi.saveLoiDraft({
      expectedDraftVersion: 0,
      expectedSequence: 0,
      negotiationId: blockCreated.id,
      terms: blockCreated.starterTerms!,
    });
    const blockResults = await runBehindPairBarrier(blockFixture.pairKey, [
      () => loi.submitLoiRevision({
        clientActionId: randomUUID(),
        expectedDraftId: blockDraft.draft!.id,
        expectedDraftVersion: blockDraft.draft!.draftVersion,
        expectedSequence: 0,
        negotiationId: blockCreated.id,
        responseDeadline: futureDeadline(4),
      }),
      () => messaging.blockConversationUser({
        conversationId: blockFixture.conversationId,
        reason: "LOI submit/block race proof.",
      }),
    ]);
    expect(blockResults.some((result) => result.status === "fulfilled")).toBe(true);
    const blocked = await negotiationState(blockCreated.id);
    expect(blocked.status).toBe("READ_ONLY");
    expect(blocked.pendingOutboxJobs).toBe(0);
    expect(blocked.frozenEvents).toBe(1);

    const expiryFixture = await seedFixture();
    const expiryCreated = await createNegotiation(expiryFixture);
    const submitted = await saveAndSubmit(expiryFixture, expiryCreated.starterTerms!, 0, 2);
    asUser(expiryFixture.sellerId, "SELLER");
    const counterTerms = structuredClone(submitted.revisions.at(-1)!.terms);
    counterTerms.additionalTerms.proposedTerms = "Maintenance race proof.";
    const expiryDraft = await loi.saveLoiDraft({
      expectedDraftVersion: 0,
      expectedSequence: 1,
      negotiationId: expiryCreated.id,
      terms: counterTerms,
    });
    const blocker = await holdPairLock(expiryFixture.pairKey);
    const submitResultPromise = settle(loi.submitLoiRevision({
      clientActionId: randomUUID(),
      expectedDraftId: expiryDraft.draft!.id,
      expectedDraftVersion: expiryDraft.draft!.draftVersion,
      expectedSequence: 1,
      negotiationId: expiryCreated.id,
      responseDeadline: futureDeadline(5),
    }));
    let barrierError: unknown;
    let maintenanceResult: SettledResult<unknown> | undefined;
    try {
      await waitForAdvisoryWaiters(1);
      maintenanceResult = await settle(maintenance.expireMarketplaceState(new Date(Date.now() + 3 * 60 * 60 * 1000)));
    } catch (error) {
      barrierError = error;
    } finally {
      try {
        await blocker.release();
      } catch (error) {
        barrierError ??= error;
      }
    }
    const submitResult = await submitResultPromise;
    if (barrierError) throw barrierError;
    expect(maintenanceResult?.status).toBe("fulfilled");
    expectRejectedLoiCode(submitResult, "UNAVAILABLE");
    const expiryState = await negotiationState(expiryCreated.id);
    expect(expiryState).toMatchObject({ expiredEvents: 1, revisions: 1, status: "EXPIRED" });
  }, 90_000);

  it("uses distinct PostgreSQL connections for the canonical pair-lock barrier", async () => {
    const fixture = await seedFixture();
    const first = new pg.Client({ connectionString: databaseUrl });
    const second = new pg.Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      const [firstPid, secondPid] = await Promise.all([
        first.query("SELECT pg_backend_pid() AS pid"),
        second.query("SELECT pg_backend_pid() AS pid"),
      ]);
      expect(firstPid.rows[0].pid).not.toBe(secondPid.rows[0].pid);
      await first.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.pairKey],
      );
      let secondSettled = false;
      const waiting = second.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.pairKey],
      ).then(() => { secondSettled = true; });
      await waitForAdvisoryLock(secondPid.rows[0].pid);
      expect(secondSettled).toBe(false);
      await first.query("COMMIT");
      await waiting;
      expect(secondSettled).toBe(true);
      await second.query("ROLLBACK");
    } finally {
      await Promise.all([
        first.query("ROLLBACK").catch(() => undefined),
        second.query("ROLLBACK").catch(() => undefined),
      ]);
      await Promise.all([first.end(), second.end()]);
    }
  }, 30_000);

  it("authorizes only active participants for the private LOI Realtime topic", async () => {
    const fixture = await seedFixture();
    const created = await createNegotiation(fixture);
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await setJwtSubject(client, fixture.buyerId);
      const participant = await client.query(
        "SELECT app_private.can_join_loi_topic($1) AS allowed",
        [`loi:${created.id}`],
      );
      await setJwtSubject(client, fixture.outsiderId);
      const outsider = await client.query(
        "SELECT app_private.can_join_loi_topic($1) AS allowed",
        [`loi:${created.id}`],
      );
      const malformed = await client.query(
        "SELECT app_private.can_join_loi_topic('loi:not-a-uuid') AS allowed",
      );
      expect(participant.rows[0].allowed).toBe(true);
      expect(outsider.rows[0].allowed).toBe(false);
      expect(malformed.rows[0].allowed).toBe(false);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }, 30_000);

  it("rejects invalid closed-state and event shapes at the database boundary", async () => {
    const fixture = await seedFixture();
    const created = await createNegotiation(fixture);
    const submitted = await saveAndSubmit(fixture, created.starterTerms!, 0);
    const revisionId = submitted.revisions.at(-1)!.id;
    const client = await pool!.connect();
    await client.query("BEGIN");
    try {
      await expectPostgresCode(client, () => client.query(`UPDATE public."LoiNegotiation"
        SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'DECLINED'
        WHERE id = $1::uuid`, [created.id]), "23514");
      await expectPostgresCode(client, () => client.query(`INSERT INTO public."LoiEvent" (
          id, "negotiationId", "revisionId", "actorUserId", "actorRole", type,
          "clientActionId", metadata, "createdAt"
        ) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'BUYER',
          'FROZEN', $4::uuid, '{}'::jsonb, now())`,
      [created.id, revisionId, fixture.buyerId, randomUUID()]), "23514");
      await expectPostgresCode(client, () => client.query(`INSERT INTO public."LoiEvent" (
          id, "negotiationId", "revisionId", "actorUserId", "actorRole", type,
          "clientActionId", metadata, "createdAt"
        ) VALUES (gen_random_uuid(), $1::uuid, NULL, $2::uuid, 'BUYER',
          'WITHDRAWN', $3::uuid, '{}'::jsonb, now())`,
      [created.id, fixture.outsiderId, randomUUID()]), "23514");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }, 30_000);
});

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const buyerId = randomUUID();
  const sellerId = randomUUID();
  const outsiderId = randomUUID();
  const marketId = randomUUID();
  const serviceAreaId = randomUUID();
  const buyerProfileId = `loi-buyer-${suffix}`;
  const propertyId = `loi-property-${suffix}`;
  const inviteId = `loi-invite-${suffix}`;

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    for (const [id, email, name] of [
      [buyerId, `loi-buyer-${suffix}@example.invalid`, "LOI Buyer"],
      [sellerId, `loi-seller-${suffix}@example.invalid`, "LOI Seller"],
      [outsiderId, `loi-outsider-${suffix}@example.invalid`, "LOI Outsider"],
    ]) {
      await client.query(`INSERT INTO auth.users (
          id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES ($1::uuid, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
      [id, email, name]);
    }
    await client.query(`UPDATE public."User"
      SET name = CASE id WHEN $1::uuid THEN 'LOI Buyer' WHEN $2::uuid THEN 'LOI Seller' ELSE 'LOI Outsider' END,
          roles = CASE id WHEN $2::uuid THEN ARRAY['SELLER']::public."UserRole"[] ELSE ARRAY['BUYER']::public."UserRole"[] END,
          status = 'ACTIVE'
      WHERE id = ANY($3::uuid[])`, [buyerId, sellerId, [buyerId, sellerId, outsiderId]]);
    await client.query(`INSERT INTO public."SellerAccess" (id, "userId", status, "reviewedAt", "createdAt", "updatedAt")
      VALUES ($1, $2::uuid, 'APPROVED', now(), now(), now())`, [`loi-access-${suffix}`, sellerId]);
    await client.query(`INSERT INTO public.markets (
        id, slug, label, state, country, center_lat, center_lng,
        bbox_west, bbox_south, bbox_east, bbox_north, active, created_at, updated_at
      ) VALUES ($1::uuid, $2, 'LOI Test Market', 'CA', 'US', 34.1, -118.3,
        -118.6, 33.9, -118.0, 34.4, true, now(), now())`, [marketId, `loi-${suffix}`]);
    await client.query(`INSERT INTO public.service_areas (
        id, market_id, slug, label, type, postal_code, city, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, source, source_version, search_terms, active, is_pilot,
        created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3, '90001', 'zip', '90001', 'Los Angeles', 'CA',
        34.1, -118.3, -118.4, 34.0, -118.2, 34.2,
        $4, 'loi-behavior-test', '1', ARRAY[$3, '90001'], true, false, now(), now())`,
    [serviceAreaId, marketId, `loi-area-${suffix}`, `/loi/${suffix}.geojson`]);
    await client.query(`INSERT INTO public."BuyerProfile" (
        id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, 'LOI Buyer', 'DRAFT', now(), now())`, [buyerProfileId, buyerId]);
    await client.query(`INSERT INTO public."BuyerCriteria" (
        id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`, [`loi-criteria-${suffix}`, buyerProfileId]);
    await client.query(`INSERT INTO public.buyer_desired_service_areas (
        buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
      ) VALUES ($1, $2::uuid, 'SELECTED', true, now(), now())`, [buyerProfileId, serviceAreaId]);
    await client.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now() WHERE id = $1`, [buyerProfileId]);
    await client.query(`INSERT INTO public."SellerProperty" (
        id, "ownerUserId", "addressLine1", city, state, zip, "propertyType", features, price,
        "ownershipVerificationStatus", status, "identityVersion", "authorityAttestedAt",
        "authorityAttestedByUserId", "attestationVersion", "authorityAttestedIdentityVersion",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, '100 LOI Proof Way', 'Los Angeles', 'CA', '90001', 'HOME', ARRAY[]::text[], 1000000,
        'APPROVED', 'READY_FOR_INVITES', 1, now(), $2::uuid, 'loi-behavior-v1', 1, now(), now())`,
    [propertyId, sellerId]);
    await client.query(`INSERT INTO public."Invite" (
        id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion", title, message,
        "openingTemplateKey", "openingTemplateVersion", status, "sentAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, $3, $4, 1, 'LOI proof invite', 'Would you like more photos or property details?',
        'SELLER_MORE_DETAILS', 1, 'SENT', now(), now() + interval '30 days', now(), now())`,
    [inviteId, sellerId, buyerProfileId, propertyId]);
    await client.query(`UPDATE public."Invite"
      SET status = 'ACCEPTED', "viewedAt" = now(), "respondedAt" = now(), "updatedAt" = now()
      WHERE id = $1`, [inviteId]);
    const conversation = await client.query(`SELECT id FROM public."Conversation" WHERE "inviteId" = $1`, [inviteId]);
    if (conversation.rowCount !== 1) throw new Error("LOI fixture conversation was not created.");
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

async function createNegotiation(fixture: Fixture) {
  enablePair(fixture);
  asUser(fixture.buyerId, "BUYER");
  const result = await loi.createLoiNegotiation({ clientActionId: randomUUID(), inviteId: fixture.inviteId });
  expect(result.status).toBe("AWAITING_BUYER_SUBMISSION");
  expect(result.starterTerms).not.toBeNull();
  return result;
}

async function saveAndSubmit(
  fixture: Fixture,
  terms: LoiTermsV1,
  expectedSequence: number,
  deadlineHours = 3,
) {
  const saved = await loi.saveLoiDraft({
    expectedDraftVersion: 0,
    expectedSequence,
    negotiationId: (await negotiationForInvite(fixture.inviteId)).id,
    terms,
  });
  return loi.submitLoiRevision({
    clientActionId: randomUUID(),
    expectedDraftId: saved.draft!.id,
    expectedDraftVersion: saved.draft!.draftVersion,
    expectedSequence,
    negotiationId: (await negotiationForInvite(fixture.inviteId)).id,
    responseDeadline: futureDeadline(deadlineHours),
  });
}

async function negotiationForInvite(inviteId: string) {
  const result = await pool!.query(`SELECT id FROM public."LoiNegotiation" WHERE "inviteId" = $1`, [inviteId]);
  if (result.rowCount !== 1) throw new Error("LOI fixture negotiation was not found.");
  return result.rows[0] as { id: string };
}

async function negotiationState(negotiationId: string) {
  const result = await pool!.query(`SELECT negotiation.status::text AS status,
      (SELECT count(*)::int FROM public."LoiRevision" revision WHERE revision."negotiationId" = negotiation.id) AS revisions,
      (SELECT count(*)::int FROM public."LoiEvent" event WHERE event."negotiationId" = negotiation.id) AS events,
      (SELECT count(*)::int FROM public."LoiEvent" event WHERE event."negotiationId" = negotiation.id AND event.type IN ('INITIAL_SUBMITTED', 'COUNTER_SUBMITTED')) AS "submissionEvents",
      (SELECT count(*)::int FROM public."LoiEvent" event WHERE event."negotiationId" = negotiation.id AND event.type = 'DECLINED') AS "declinedEvents",
      (SELECT count(*)::int FROM public."LoiEvent" event WHERE event."negotiationId" = negotiation.id AND event.type = 'FROZEN') AS "frozenEvents",
      (SELECT count(*)::int FROM public."LoiEvent" event WHERE event."negotiationId" = negotiation.id AND event.type = 'EXPIRED') AS "expiredEvents",
      (SELECT count(*)::int FROM public."EmailOutbox" outbox WHERE outbox."loiNegotiationId" = negotiation.id) AS "outboxJobs",
      (SELECT count(*)::int FROM public."EmailOutbox" outbox WHERE outbox."loiNegotiationId" = negotiation.id AND outbox.status = 'CANCELLED') AS "cancelledOutboxJobs",
      (SELECT count(*)::int FROM public."EmailOutbox" outbox WHERE outbox."loiNegotiationId" = negotiation.id AND outbox.status = 'PENDING') AS "pendingOutboxJobs",
      (SELECT count(*)::int FROM public."EmailOutbox" outbox WHERE outbox."loiNegotiationId" = negotiation.id AND outbox."loiRecipientUserId" = negotiation."buyerUserId" AND outbox.status = 'PENDING') AS "pendingBuyerOutboxJobs",
      (SELECT count(*)::int FROM public."EmailOutbox" outbox WHERE outbox."loiNegotiationId" = negotiation.id AND outbox."loiRecipientUserId" = negotiation."sellerUserId" AND outbox.status = 'PENDING') AS "pendingSellerOutboxJobs",
      (SELECT count(*)::int FROM public."Notification" notification WHERE notification.metadata ->> 'negotiationId' = negotiation.id::text) AS notifications
    FROM public."LoiNegotiation" negotiation WHERE negotiation.id = $1::uuid`, [negotiationId]);
  if (result.rowCount !== 1) throw new Error("LOI negotiation state was not found.");
  return result.rows[0];
}

async function expectLoiCode(promise: Promise<unknown>, code: string) {
  let received: unknown;
  try {
    await promise;
  } catch (error) {
    received = error;
  }
  expect(received).toBeDefined();
  expect((received as { code?: string }).code).toBe(code);
}

async function expectPostgresCode(
  client: pg.PoolClient,
  operation: () => Promise<unknown>,
  expectedCode: string,
) {
  await client.query("SAVEPOINT invalid_loi_shape");
  let code: string | undefined;
  try {
    await operation();
  } catch (error) {
    code = (error as { code?: string }).code;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT invalid_loi_shape");
    await client.query("RELEASE SAVEPOINT invalid_loi_shape");
  }
  expect(code).toBe(expectedCode);
}

function enablePair(fixture: Fixture) {
  const cohort = `${fixture.buyerId},${fixture.sellerId}`;
  process.env.LIBER_LOI_V1_ENABLED = "true";
  process.env.LIBER_LOI_V1_COHORT_USER_IDS = cohort;
  process.env.LIBER_MESSAGING_V1_ENABLED = "true";
  process.env.LIBER_MESSAGING_V1_COHORT_USER_IDS = cohort;
}

function asUser(userId: string, role: "BUYER" | "SELLER") {
  mocks.userId = userId;
  mocks.role = role;
}

function futureDeadline(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function setJwtSubject(client: pg.PoolClient, userId: string) {
  await client.query(
    `SELECT set_config('request.jwt.claims', jsonb_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
    [userId],
  );
}

async function waitForAdvisoryLock(pid: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await pool!.query(`SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1`, [pid]);
    if (result.rows[0]?.wait_event_type === "Lock" && result.rows[0]?.wait_event === "advisory") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Second LOI proof connection did not block on the canonical advisory lock.");
}

async function holdPairLock(pairKey: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [pairKey]);
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await client.query("COMMIT").finally(() => client.end());
    },
  };
}

async function runBehindPairBarrier(pairKey: string, operations: Array<() => Promise<unknown>>) {
  const blocker = await holdPairLock(pairKey);
  const resultsPromise = Promise.allSettled(operations.map((operation) => Promise.resolve().then(operation)));
  let barrierError: unknown;
  try {
    await waitForAdvisoryWaiters(operations.length);
  } catch (error) {
    barrierError = error;
  } finally {
    try {
      await blocker.release();
    } catch (error) {
      barrierError ??= error;
    }
  }
  const results = await resultsPromise;
  if (barrierError) throw barrierError;
  return results;
}

async function waitForAdvisoryWaiters(expected: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await pool!.query(`SELECT count(DISTINCT pid)::int AS count
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'
        AND datname = current_database()
        AND query LIKE '%pg_advisory_xact_lock%'`);
    if ((result.rows[0]?.count ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Expected ${expected} service database sessions to wait at the canonical pair lock.`);
}

type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { reason: unknown; status: "rejected" };

async function settle<T>(promise: Promise<T>): Promise<SettledResult<T>> {
  try {
    return { status: "fulfilled" as const, value: await promise };
  } catch (reason) {
    return { reason, status: "rejected" as const };
  }
}

function expectRejectedLoiCode(result: SettledResult<unknown>, code: string) {
  expect(result.status).toBe("rejected");
  if (result.status === "rejected") expect((result.reason as { code?: string }).code).toBe(code);
}

async function assertDisposableTarget() {
  const sentinel = process.env.LOI_BEHAVIOR_TEST_SENTINEL;
  if (!databaseUrl || !sentinel || sentinel.length < 16) {
    throw new Error("LOI behavior test requires a disposable URL and 16+ character sentinel.");
  }
  const shared = JSON.parse(process.env.LOI_BEHAVIOR_TEST_SHARED_DATABASE_URLS ?? "[]");
  if (!Array.isArray(shared) || shared.some((value) => typeof value !== "string")) {
    throw new Error("LOI behavior shared-target deny list is invalid.");
  }
  if (shared.some((url) => sameDatabaseTarget(url, databaseUrl))) {
    throw new Error("Refusing LOI behavior test against a configured shared database.");
  }
  const result = await pool!.query(`SELECT
    to_regclass('public.loi_migration_test_sentinel') IS NOT NULL AS present,
    EXISTS (SELECT 1 FROM public.loi_migration_test_sentinel WHERE token = $1) AS verified`, [sentinel]);
  if (!result.rows[0]?.present || !result.rows[0]?.verified) {
    throw new Error("Disposable LOI behavior sentinel is missing or does not match.");
  }
}
