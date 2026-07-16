import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const mode = process.argv[2];
if (!new Set(["fresh", "upgrade"]).has(mode)) throw new Error("Usage: node scripts/test-loi-database.mjs fresh|upgrade");
const url = process.env.LOI_MIGRATION_TEST_DATABASE_URL;
const sentinel = process.env.LOI_MIGRATION_TEST_SENTINEL;
const loiMigration = "20260716030741_add_loi_negotiations";
const repairMigration = "20260716120000_harden_loi_event_semantics";
const preLoiMigration = "20260715215000_reconcile_email_outbox_lease";
const migrationRoot = path.resolve("packages/db/prisma/migrations");
const optIn = mode === "fresh" ? "LOI_MIGRATION_TEST_ALLOW_RESET" : "LOI_MIGRATION_TEST_ALLOW_WRITES";
await assertDisposable(url, sentinel, optIn);
const expectedChecksums = {
  [loiMigration]: "27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245",
  [repairMigration]: "bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86",
};
await Promise.all([loiMigration, repairMigration].map(async (migrationName) => {
  const bytes = await readFile(path.join(migrationRoot, migrationName, "migration.sql"));
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== expectedChecksums[migrationName]) {
    throw new Error(`Reviewed LOI migration checksum changed: ${migrationName}.`);
  }
}));

let retainedFixture = null;
if (mode === "upgrade") {
  const before = new pg.Client({ connectionString: url });
  await before.connect();
  try {
    await assertImmediatePreLoiState(before);
  } finally {
    await before.end();
  }

  await stageUpgradeThroughBase(url);

  const base = new pg.Client({ connectionString: url });
  await base.connect();
  try {
    await assertRetainedBaseState(base);
    retainedFixture = await seedRetainedBaseFixture(base);
  } finally {
    await base.end();
  }

  runPrisma("deploy", "prisma.config.ts", url);
} else {
  runPrisma("reset", "prisma.baseline.config.ts", url, ["--force"]);
}

const proof = new pg.Client({ connectionString: url });
await proof.connect();
try {
  const result = await proof.query(`
    SELECT
      to_regclass('public."LoiNegotiation"') IS NOT NULL AS negotiation_table,
      to_regclass('public."LoiDraft"') IS NOT NULL AS draft_table,
      to_regclass('public."LoiRevision"') IS NOT NULL AS revision_table,
      to_regclass('public."LoiEvent"') IS NOT NULL AS event_table,
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."LoiDraft"'::regclass) AS draft_rls,
      NOT has_table_privilege('anon', 'public."LoiDraft"', 'SELECT') AS anon_closed,
      NOT has_table_privilege('authenticated', 'public."LoiRevision"', 'SELECT') AS authenticated_closed,
      NOT has_table_privilege('service_role', 'public."LoiEvent"', 'SELECT') AS service_role_closed,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public."LoiRevision"'::regclass AND tgname = 'loi_revision_immutable' AND tgenabled <> 'D') AS revision_immutable,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public."LoiEvent"'::regclass AND tgname = 'loi_event_immutable' AND tgenabled <> 'D') AS event_immutable,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."LoiNegotiation"'::regclass AND conname = 'LoiNegotiation_sequence_check' AND pg_get_constraintdef(oid) LIKE '%WITHDRAWN%' AND pg_get_constraintdef(oid) LIKE '%READ_ONLY%') AS initial_terminal_states,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."LoiRevision"'::regclass AND conname = 'LoiRevision_deadline_check') AS deadline_check,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."LoiEvent"'::regclass AND conname = 'LoiEvent_shape_check' AND convalidated) AS event_shape_check,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."LoiNegotiation"'::regclass AND conname = 'LoiNegotiation_closed_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%RESPONSE_EXPIRED%' AND pg_get_constraintdef(oid) LIKE '%ADMIN_RESTRICTED%') AS closed_reason_mapping,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."LoiEvent"'::regclass
          AND conname = 'LoiEvent_actorUserId_fkey'
          AND confdeltype = 'r' AND confupdtype = 'r'
      ) AS event_actor_retained,
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'EmailOutbox_loi_delivery_idx') AS short_outbox_index,
      (SELECT count(*)::int FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = ANY(ARRAY['LoiNegotiation', 'LoiDraft', 'LoiRevision', 'LoiEvent']) AND relation.relrowsecurity) = 4 AS all_rls_enabled,
      NOT EXISTS (
        SELECT 1
        FROM (VALUES ('anon'), ('authenticated'), ('service_role')) role_name(name)
        CROSS JOIN (VALUES ('LoiNegotiation'), ('LoiDraft'), ('LoiRevision'), ('LoiEvent')) table_name(name)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privilege_name(name)
        WHERE has_table_privilege(role_name.name, format('public.%I', table_name.name), privilege_name.name)
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) privilege
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY(ARRAY['LoiNegotiation', 'LoiDraft', 'LoiRevision', 'LoiEvent'])
          AND privilege.grantee = 0
          AND privilege.privilege_type = ANY(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
      ) AS raw_table_access_denied,
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND policyname = 'Active participants can receive conversation broadcasts'
          AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
          AND qual LIKE '%can_join_conversation_topic%'
          AND qual LIKE '%can_join_loi_topic%'
      ) AS private_receive_policy,
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND cmd IN ('SELECT', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
          AND policyname <> 'Active participants can receive conversation broadcasts'
      ) AS no_conflicting_receive_policy,
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND cmd IN ('INSERT', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      ) AS no_browser_broadcast_insert_policy,
      has_function_privilege('authenticated', 'app_private.can_join_loi_topic(text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'app_private.can_join_loi_topic(text)', 'EXECUTE')
        AND NOT has_function_privilege('service_role', 'app_private.can_join_loi_topic(text)', 'EXECUTE')
        AS topic_helper_bounded
  `);
  assertAllTrue(result.rows[0], `LOI ${mode} catalog proof`);
  await assertMigrationLedger(proof, [loiMigration, repairMigration]);
  if (retainedFixture) await verifyRetainedBaseFixture(proof, retainedFixture);
  await restoreSentinel(proof, sentinel);
  process.stdout.write(`${JSON.stringify({
    mode,
    status: "passed",
    migrations: [loiMigration, repairMigration],
    retainedBaseData: Boolean(retainedFixture),
  }, null, 2)}\n`);
} finally {
  await proof.end();
}

async function assertImmediatePreLoiState(client) {
  const result = await client.query(`SELECT
      to_regclass('public."LoiNegotiation"') IS NULL
        AND to_regclass('public."LoiDraft"') IS NULL
        AND to_regclass('public."LoiRevision"') IS NULL
        AND to_regclass('public."LoiEvent"') IS NULL AS loi_tables_absent,
      NOT EXISTS (
        SELECT 1 FROM public._prisma_migrations
        WHERE migration_name = ANY($1::text[])
      ) AS loi_ledger_absent,
      (
        SELECT migration_name
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name DESC
        LIMIT 1
      ) = $2 AS latest_is_pre_loi`, [[loiMigration, repairMigration], preLoiMigration]);
  assertAllTrue(result.rows[0], "LOI upgrade target immediate pre-LOI proof");
}

async function stageUpgradeThroughBase(connectionString) {
  const stageRoot = await mkdtemp(path.join(tmpdir(), "liber-loi-base-stage-"));
  try {
    const entries = await readdir(migrationRoot, { withFileTypes: true });
    const migrationNames = entries
      .filter((entry) => entry.isDirectory() && entry.name <= loiMigration)
      .map((entry) => entry.name)
      .sort();
    if (migrationNames.at(-1) !== loiMigration || migrationNames.includes(repairMigration)) {
      throw new Error("LOI base-stage migration inventory is not bounded at the reviewed base migration.");
    }
    for (const migrationName of migrationNames) {
      await cp(path.join(migrationRoot, migrationName), path.join(stageRoot, migrationName), {
        errorOnExist: true,
        recursive: true,
      });
    }
    runPrisma("deploy", "prisma.loi-stage.config.ts", connectionString, [], {
      LOI_MIGRATION_STAGE_PATH: stageRoot,
    });
  } finally {
    await removeMigrationStage(stageRoot);
  }
}

async function removeMigrationStage(stageRoot) {
  const resolvedStage = path.resolve(stageRoot);
  if (path.dirname(resolvedStage) !== path.resolve(tmpdir())
    || !path.basename(resolvedStage).startsWith("liber-loi-base-stage-")) {
    throw new Error("Refusing to remove an unrecognized LOI migration stage path.");
  }
  await rm(resolvedStage, { force: true, recursive: true });
}

async function assertRetainedBaseState(client) {
  const ledger = await client.query(`SELECT migration_name, checksum
    FROM public._prisma_migrations
    WHERE migration_name = ANY($1::text[])
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL`, [[loiMigration, repairMigration]]);
  if (ledger.rowCount !== 1
    || ledger.rows[0]?.migration_name !== loiMigration
    || ledger.rows[0]?.checksum !== expectedChecksums[loiMigration]) {
    throw new Error("LOI retained-base proof did not record the reviewed base migration and checksum alone.");
  }
  const catalog = await client.query(`SELECT
      to_regclass('public."LoiNegotiation"') IS NOT NULL AS negotiation_table,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."LoiEvent"'::regclass
          AND conname = 'LoiEvent_actorUserId_fkey'
          AND confdeltype = 'n' AND confupdtype = 'r'
      ) AS original_actor_set_null,
      NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."LoiEvent"'::regclass
          AND conname = 'LoiEvent_shape_check'
      ) AS repair_shape_absent`);
  assertAllTrue(catalog.rows[0], "LOI retained-base catalog proof");
}

async function seedRetainedBaseFixture(client) {
  const suffix = randomUUID();
  const fixture = {
    buyerId: randomUUID(),
    sellerId: randomUUID(),
    marketId: randomUUID(),
    serviceAreaId: randomUUID(),
    buyerProfileId: `loi-upgrade-buyer-${suffix}`,
    propertyId: `loi-upgrade-property-${suffix}`,
    inviteId: `loi-upgrade-invite-${suffix}`,
    negotiationId: randomUUID(),
    revisionIds: [randomUUID(), randomUUID()],
    actionIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  };
  const terms = representativeTerms();
  const counterTerms = structuredClone(terms);
  counterTerms.additionalTerms.proposedTerms = "Seller requests a 28-day close.";
  const summary = {
    calculationVersion: 1,
    earnestMoneyBps: 300,
    earnestMoneyCents: 3_000_000,
    effectivePriceAfterSellerCreditCents: 100_000_000,
    loanAmountCents: 0,
    loanToValueBps: 0,
    remainingDownPaymentAfterDepositCents: 97_000_000,
  };
  fixture.terms = terms;
  fixture.counterTerms = counterTerms;
  fixture.summary = summary;

  await client.query("BEGIN");
  try {
    for (const [id, email, name, role] of [
      [fixture.buyerId, `loi-upgrade-buyer-${suffix}@example.invalid`, "LOI Upgrade Buyer", "BUYER"],
      [fixture.sellerId, `loi-upgrade-seller-${suffix}@example.invalid`, "LOI Upgrade Seller", "SELLER"],
    ]) {
      await client.query(`INSERT INTO auth.users (
          id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES ($1::uuid, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
      [id, email, name]);
      await client.query(`UPDATE public."User"
        SET name = $2, roles = ARRAY[$3]::public."UserRole"[], status = 'ACTIVE'
        WHERE id = $1::uuid`, [id, name, role]);
    }
    await client.query(`INSERT INTO public."SellerAccess" (id, "userId", status, "reviewedAt", "createdAt", "updatedAt")
      VALUES ($1, $2::uuid, 'APPROVED', now(), now(), now())`, [`loi-upgrade-access-${suffix}`, fixture.sellerId]);
    await client.query(`INSERT INTO public.markets (
        id, slug, label, state, country, center_lat, center_lng,
        bbox_west, bbox_south, bbox_east, bbox_north, active, created_at, updated_at
      ) VALUES ($1::uuid, $2, 'LOI Upgrade Market', 'CA', 'US', 34.1, -118.3,
        -118.6, 33.9, -118.0, 34.4, true, now(), now())`, [fixture.marketId, `loi-upgrade-${suffix}`]);
    await client.query(`INSERT INTO public.service_areas (
        id, market_id, slug, label, type, postal_code, city, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, source, source_version, search_terms, active, is_pilot,
        created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3, '90001', 'zip', '90001', 'Los Angeles', 'CA',
        34.1, -118.3, -118.4, 34.0, -118.2, 34.2,
        $4, 'loi-upgrade-proof', '1', ARRAY[$3, '90001'], true, false, now(), now())`,
    [fixture.serviceAreaId, fixture.marketId, `loi-upgrade-area-${suffix}`, `/loi-upgrade/${suffix}.geojson`]);
    await client.query(`INSERT INTO public."BuyerProfile" (
        id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, 'LOI Upgrade Buyer', 'DRAFT', now(), now())`, [fixture.buyerProfileId, fixture.buyerId]);
    await client.query(`INSERT INTO public."BuyerCriteria" (
        id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`, [`loi-upgrade-criteria-${suffix}`, fixture.buyerProfileId]);
    await client.query(`INSERT INTO public.buyer_desired_service_areas (
        buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
      ) VALUES ($1, $2::uuid, 'SELECTED', true, now(), now())`, [fixture.buyerProfileId, fixture.serviceAreaId]);
    await client.query(`UPDATE public."BuyerProfile"
      SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now()
      WHERE id = $1`, [fixture.buyerProfileId]);
    await client.query(`INSERT INTO public."SellerProperty" (
        id, "ownerUserId", "addressLine1", city, state, zip, "propertyType", features, price,
        "ownershipVerificationStatus", status, "identityVersion", "authorityAttestedAt",
        "authorityAttestedByUserId", "attestationVersion", "authorityAttestedIdentityVersion",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, '100 LOI Upgrade Way', 'Los Angeles', 'CA', '90001', 'HOME', ARRAY[]::text[], 1000000,
        'APPROVED', 'READY_FOR_INVITES', 1, now(), $2::uuid, 'loi-upgrade-v1', 1, now(), now())`,
    [fixture.propertyId, fixture.sellerId]);
    await client.query(`INSERT INTO public."Invite" (
        id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion", title, message,
        "openingTemplateKey", "openingTemplateVersion", status, "sentAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, $3, $4, 1, 'LOI upgrade proof invite', 'Would you like more photos or property details?',
        'SELLER_MORE_DETAILS', 1, 'SENT', now(), now() + interval '30 days', now(), now())`,
    [fixture.inviteId, fixture.sellerId, fixture.buyerProfileId, fixture.propertyId]);
    await client.query(`UPDATE public."Invite"
      SET status = 'ACCEPTED', "viewedAt" = now(), "respondedAt" = now(), "updatedAt" = now()
      WHERE id = $1`, [fixture.inviteId]);
    const conversation = await client.query(`SELECT id
      FROM public."Conversation"
      WHERE "inviteId" = $1`, [fixture.inviteId]);
    if (conversation.rowCount !== 1) throw new Error("Retained-base fixture conversation was not created.");
    fixture.conversationId = conversation.rows[0].id;

    await client.query(`INSERT INTO public."LoiNegotiation" (
        id, "inviteId", "conversationId", "buyerUserId", "sellerUserId", "propertyId",
        "propertyIdentityVersion", status, "propertySnapshot", "createdAt", "updatedAt"
      ) SELECT $1::uuid, invite.id, conversation.id, buyer."userId", invite."sellerId", property.id,
          invite."propertyIdentityVersion", 'AWAITING_BUYER_SUBMISSION', conversation."propertySnapshot",
          now() - interval '4 hours', now() - interval '4 hours'
        FROM public."Invite" invite
        JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
        JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
        JOIN public."SellerProperty" property ON property.id = invite."propertyId"
        WHERE invite.id = $2`, [fixture.negotiationId, fixture.inviteId]);
    await client.query(`INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata, "createdAt"
      ) VALUES ($1::uuid, NULL, $2::uuid, 'BUYER', 'NEGOTIATION_CREATED', $3::uuid,
        '{"proof":"retained-base"}'::jsonb, now() - interval '4 hours')`,
    [fixture.negotiationId, fixture.buyerId, fixture.actionIds[0]]);
    await client.query(`INSERT INTO public."LoiRevision" (
        id, "negotiationId", sequence, "parentRevisionId", kind, "submittedByUserId", "submittedByRole",
        "schemaVersion", "calculationVersion", terms, "computedSummary", "responseDeadline", "submittedAt"
      ) VALUES ($1::uuid, $2::uuid, 1, NULL, 'INITIAL', $3::uuid, 'BUYER', 1, 1,
        $4::jsonb, $5::jsonb, now() + interval '20 hours', now() - interval '3 hours')`,
    [fixture.revisionIds[0], fixture.negotiationId, fixture.buyerId, JSON.stringify(terms), JSON.stringify(summary)]);
    await client.query(`UPDATE public."LoiNegotiation"
      SET "currentRevisionId" = $2::uuid, "currentSequence" = 1,
          status = 'AWAITING_SELLER_RESPONSE', "updatedAt" = now() - interval '3 hours'
      WHERE id = $1::uuid`, [fixture.negotiationId, fixture.revisionIds[0]]);
    await client.query(`INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata, "createdAt"
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'BUYER', 'INITIAL_SUBMITTED', $4::uuid,
        '{"proof":"retained-base"}'::jsonb, now() - interval '3 hours')`,
    [fixture.negotiationId, fixture.revisionIds[0], fixture.buyerId, fixture.actionIds[1]]);
    await client.query(`INSERT INTO public."LoiRevision" (
        id, "negotiationId", sequence, "parentRevisionId", kind, "submittedByUserId", "submittedByRole",
        "schemaVersion", "calculationVersion", terms, "computedSummary", "responseDeadline", "submittedAt"
      ) VALUES ($1::uuid, $2::uuid, 2, $3::uuid, 'COUNTER', $4::uuid, 'SELLER', 1, 1,
        $5::jsonb, $6::jsonb, now() + interval '21 hours', now() - interval '2 hours')`,
    [fixture.revisionIds[1], fixture.negotiationId, fixture.revisionIds[0], fixture.sellerId, JSON.stringify(counterTerms), JSON.stringify(summary)]);
    await client.query(`UPDATE public."LoiNegotiation"
      SET "currentRevisionId" = $2::uuid, "currentSequence" = 2,
          status = 'AWAITING_BUYER_RESPONSE', "updatedAt" = now() - interval '2 hours'
      WHERE id = $1::uuid`, [fixture.negotiationId, fixture.revisionIds[1]]);
    await client.query(`INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata, "createdAt"
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'SELLER', 'COUNTER_SUBMITTED', $4::uuid,
        '{"proof":"retained-base"}'::jsonb, now() - interval '2 hours')`,
    [fixture.negotiationId, fixture.revisionIds[1], fixture.sellerId, fixture.actionIds[2]]);
    await client.query(`UPDATE public."LoiNegotiation"
      SET status = 'TERMS_ALIGNED', "closedReason" = 'TERMS_ALIGNED',
          "closedAt" = now() - interval '1 hour', "updatedAt" = now() - interval '1 hour'
      WHERE id = $1::uuid`, [fixture.negotiationId]);
    await client.query(`INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata, "createdAt"
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'BUYER', 'TERMS_ALIGNED', $4::uuid,
        '{"proof":"retained-base"}'::jsonb, now() - interval '1 hour')`,
    [fixture.negotiationId, fixture.revisionIds[1], fixture.buyerId, fixture.actionIds[3]]);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("COMMIT");
    return fixture;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function verifyRetainedBaseFixture(client, fixture) {
  await assertRetainedFixtureRows(client, fixture);
  await client.query("BEGIN");
  try {
    await expectPostgresCode(client, "closed_reason", `UPDATE public."LoiNegotiation"
      SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'DECLINED'
      WHERE id = $1::uuid`, [fixture.negotiationId], "23514");
    await expectPostgresCode(client, "event_shape", `INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'BUYER', 'FROZEN', $4::uuid, '{}'::jsonb)`,
    [fixture.negotiationId, fixture.revisionIds[1], fixture.buyerId, randomUUID()], "23514");
    await expectPostgresCode(client, "decision_actor", `INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'SELLER', 'DECLINED', $4::uuid, '{}'::jsonb)`,
    [fixture.negotiationId, fixture.revisionIds[1], fixture.sellerId, randomUUID()], "23514");
    await expectPostgresCode(client, "current_revision", `INSERT INTO public."LoiEvent" (
        "negotiationId", "revisionId", "actorUserId", "actorRole", type, "clientActionId", metadata
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'BUYER', 'INITIAL_SUBMITTED', $4::uuid, '{}'::jsonb)`,
    [fixture.negotiationId, fixture.revisionIds[0], fixture.buyerId, randomUUID()], "23514");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
  await assertRetainedFixtureRows(client, fixture);
}

async function assertRetainedFixtureRows(client, fixture) {
  const result = await client.query(`SELECT
      negotiation.id = $1::uuid AS negotiation_id,
      negotiation."inviteId" = $2 AS invite_id,
      negotiation."conversationId" = $3::uuid AS conversation_id,
      negotiation."buyerUserId" = $4::uuid AND negotiation."sellerUserId" = $5::uuid AS participants,
      negotiation.status = 'TERMS_ALIGNED'
        AND negotiation."closedReason" = 'TERMS_ALIGNED'
        AND negotiation."closedAt" IS NOT NULL AS exact_closed_state,
      negotiation."currentSequence" = 2
        AND negotiation."currentRevisionId" = $7::uuid AS current_revision,
      (SELECT count(*) = 2 FROM public."LoiRevision" revision
        WHERE revision."negotiationId" = negotiation.id
          AND revision.id = ANY($6::uuid[])) AS revisions_survived,
      EXISTS (SELECT 1 FROM public."LoiRevision" revision
        WHERE revision.id = ($6::uuid[])[1] AND revision.sequence = 1 AND revision.kind = 'INITIAL'
          AND revision."submittedByUserId" = $4::uuid AND revision."submittedByRole" = 'BUYER'
          AND revision.terms = $9::jsonb
          AND revision."computedSummary" = $11::jsonb) AS initial_revision_survived,
      EXISTS (SELECT 1 FROM public."LoiRevision" revision
        WHERE revision.id = ($6::uuid[])[2] AND revision.sequence = 2 AND revision.kind = 'COUNTER'
          AND revision."parentRevisionId" = ($6::uuid[])[1]
          AND revision."submittedByUserId" = $5::uuid AND revision."submittedByRole" = 'SELLER'
          AND revision.terms = $10::jsonb
          AND revision."computedSummary" = $11::jsonb) AS counter_revision_survived,
      (SELECT count(*) = 4 FROM public."LoiEvent" event
        WHERE event."negotiationId" = negotiation.id
          AND event."clientActionId" = ANY($8::uuid[])
          AND event."actorUserId" IS NOT NULL
          AND event.metadata @> '{"proof":"retained-base"}'::jsonb) AS events_and_actors_survived,
      EXISTS (SELECT 1 FROM public."LoiEvent" event
        WHERE event."negotiationId" = negotiation.id AND event.type = 'NEGOTIATION_CREATED'
          AND event."revisionId" IS NULL AND event."actorUserId" = $4::uuid AND event."actorRole" = 'BUYER') AS creation_event_survived,
      EXISTS (SELECT 1 FROM public."LoiEvent" event
        WHERE event."negotiationId" = negotiation.id AND event.type = 'INITIAL_SUBMITTED'
          AND event."revisionId" = ($6::uuid[])[1] AND event."actorUserId" = $4::uuid AND event."actorRole" = 'BUYER') AS initial_event_survived,
      EXISTS (SELECT 1 FROM public."LoiEvent" event
        WHERE event."negotiationId" = negotiation.id AND event.type = 'COUNTER_SUBMITTED'
          AND event."revisionId" = ($6::uuid[])[2] AND event."actorUserId" = $5::uuid AND event."actorRole" = 'SELLER') AS counter_event_survived,
      EXISTS (SELECT 1 FROM public."LoiEvent" event
        WHERE event."negotiationId" = negotiation.id AND event.type = 'TERMS_ALIGNED'
          AND event."revisionId" = ($6::uuid[])[2] AND event."actorUserId" = $4::uuid AND event."actorRole" = 'BUYER') AS agreement_event_survived
    FROM public."LoiNegotiation" negotiation
    WHERE negotiation.id = $1::uuid`, [
    fixture.negotiationId,
    fixture.inviteId,
    fixture.conversationId,
    fixture.buyerId,
    fixture.sellerId,
    fixture.revisionIds,
    fixture.revisionIds[1],
    fixture.actionIds,
    JSON.stringify(fixture.terms),
    JSON.stringify(fixture.counterTerms),
    JSON.stringify(fixture.summary),
  ]);
  if (result.rowCount !== 1) throw new Error("Retained-base LOI negotiation did not survive the repair migration.");
  assertAllTrue(result.rows[0], "Retained-base LOI data survival proof");
}

async function expectPostgresCode(client, savepoint, sql, params, expectedCode) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let receivedCode;
  try {
    await client.query(sql, params);
  } catch (error) {
    receivedCode = error?.code;
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
  if (receivedCode !== expectedCode) {
    throw new Error(`LOI repaired semantic proof ${savepoint} expected PostgreSQL ${expectedCode}, received ${receivedCode ?? "success"}.`);
  }
}

async function assertMigrationLedger(client, migrationNames) {
  const ledger = await client.query(`SELECT migration_name, checksum
    FROM public._prisma_migrations
    WHERE migration_name = ANY($1::text[])
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL`, [migrationNames]);
  if (ledger.rowCount !== migrationNames.length
    || ledger.rows.some((row) => row.checksum !== expectedChecksums[row.migration_name])) {
    throw new Error(`LOI ${mode} migration ledger/checksum proof failed.`);
  }
}

function representativeTerms() {
  return {
    additionalTerms: { exclusions: "", proposedTerms: "" },
    costsAndCredits: {
      alternateClosingCostAllocation: "",
      customaryClosingCosts: true,
      homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "" },
      sellerCreditCents: 0,
      sellerCreditNote: "",
    },
    deposit: { basis: "PERCENT", percentageBps: 300 },
    funding: { type: "CASH" },
    hoa: {
      certificateFeePayer: "NOT_APPLICABLE",
      documentFeePayer: "NOT_APPLICABLE",
      transferFeePayer: "NOT_APPLICABLE",
    },
    parties: {
      buyerContact: { company: "", email: "buyer@example.invalid", name: "LOI Upgrade Buyer", phone: "" },
      buyerLegalName: "LOI Upgrade Buyer",
      vestingNote: "",
    },
    personalProperty: { excludedItems: "", included: false, includedItems: [] },
    possession: { type: "AT_CLOSING" },
    providers: { escrow: { choice: "LIBER_PREFERRED" }, title: { choice: "LIBER_PREFERRED" } },
    purchasePriceCents: 100_000_000,
    representation: { agent: { company: "", email: "", name: "", phone: "" }, buyerRepresented: false },
    schemaVersion: 1,
    timing: {
      appraisalContingencyDays: 17,
      closingDays: 30,
      inspectionContingencyDays: 10,
      loanContingencyDays: null,
      sellerDisclosureReviewDays: 7,
      titleReviewDays: 7,
    },
  };
}

function assertAllTrue(row, label) {
  const failed = Object.entries(row ?? {}).filter(([, value]) => value !== true).map(([key]) => key);
  if (failed.length) throw new Error(`${label} failed: ${failed.join(", ")}`);
}

async function assertDisposable(connectionString, token, optInName) {
  const missing = [!connectionString && "LOI_MIGRATION_TEST_DATABASE_URL", (!token || token.length < 16) && "LOI_MIGRATION_TEST_SENTINEL (16+ characters)", process.env[optInName] !== "true" && `${optInName}=true`, !process.env.DIRECT_URL && "DIRECT_URL shared-target deny URL", !process.env.DATABASE_URL && "DATABASE_URL shared-target deny URL"].filter(Boolean);
  if (missing.length) throw new Error(`LOI database proof not run: missing ${missing.join(", ")}.`);
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) if (sameDatabaseTarget(sharedUrl, connectionString)) throw new Error("Refusing to run LOI proof against the configured shared database.");
  const guard = new pg.Client({ connectionString });
  await guard.connect();
  try {
    const result = await guard.query(`SELECT to_regclass('public.loi_migration_test_sentinel') IS NOT NULL AS present, EXISTS (SELECT 1 FROM public.loi_migration_test_sentinel WHERE token = $1) AS verified`, [token]).catch((error) => error?.code === "42P01" ? { rows: [{ present: false, verified: false }] } : Promise.reject(error));
    if (!result.rows[0]?.present || !result.rows[0]?.verified) throw new Error("Disposable LOI migration sentinel is missing or does not match.");
  } finally { await guard.end(); }
}

async function restoreSentinel(client, token) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.loi_migration_test_sentinel (token text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`);
  await client.query(`REVOKE ALL ON public.loi_migration_test_sentinel FROM PUBLIC, anon, authenticated, service_role`);
  await client.query(`INSERT INTO public.loi_migration_test_sentinel(token) VALUES ($1) ON CONFLICT (token) DO NOTHING`, [token]);
}

function runPrisma(operation, config, connectionString, extraArgs = [], extraEnv = {}) {
  run("npx", ["prisma", "migrate", operation, ...extraArgs, "--config", config], {
    ...process.env,
    ...extraEnv,
    DATABASE_URL: connectionString,
    DIRECT_URL: connectionString,
  });
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, shell: process.platform === "win32", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.`);
}
