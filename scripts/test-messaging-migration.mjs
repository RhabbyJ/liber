import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const mode = process.argv[2] ?? "static";
const migrationName = "20260714150654_add_guided_messaging_v1";
const migrationRoot = path.resolve("packages/db/prisma/migrations");
const migrationPath = path.join(migrationRoot, migrationName, "migration.sql");
const schemaPath = path.resolve("packages/db/prisma/schema.prisma");

if (mode === "static") {
  await runStaticProof();
} else if (mode === "fresh") {
  await runFreshProof();
} else if (mode === "upgrade") {
  await runUpgradeProof();
} else {
  throw new Error("Usage: node scripts/test-messaging-migration.mjs [static|fresh|upgrade]");
}

async function runStaticProof() {
  const [migration, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const requiredMigrationFragments = [
    'CREATE TABLE public."Conversation"',
    'CREATE TABLE public."ConversationParticipant"',
    'CREATE TABLE public."Message"',
    'CREATE TABLE public."UserBlock"',
    'CREATE TABLE public."MessageReport"',
    'CREATE INDEX "Message_conversationId_senderUserId_idx"',
    'DEFERRABLE INITIALLY DEFERRED',
    'LIMIT 7',
    "interval '15 minutes'",
    "'surroundingMessages', surrounding_messages",
    'EmailOutbox_messaging_payload_content_free_check',
    'EmailOutbox_unread_message_references_check',
    "WHERE type IN ('INVITE', 'MESSAGE_UNREAD') AND payload <> '{}'::jsonb",
    'CREATE TRIGGER user_block_immutable',
    "WHERE type = 'MESSAGE_UNREAD'",
    'AND "messageConversationId" = p_conversation_id',
    "regexp_replace(message, '^[[:space:]]+', '')",
    "position(E'\\r' IN body) = 0",
    "'propertyIdentityVersion'",
    "'ownershipVerificationStatus'",
    "'contextUnavailable', true",
    'WHEN property."ownerUserId" = invite."sellerId"\n      AND invite."propertyIdentityVersion" = property."identityVersion" THEN',
    'realtime.send(',
    "realtime.messages.extension = 'broadcast'",
    'FOR SELECT\nTO authenticated',
    'GRANT EXECUTE ON FUNCTION app_private.can_join_conversation_topic(text)\n  TO authenticated',
    'Invite message sender must be the invite seller.',
    "'BUYER'::public.\"UserRole\" = ANY(buyer_user.roles)",
    "'SELLER'::public.\"UserRole\" = ANY(seller.roles)",
    'AFTER UPDATE OF status, roles ON public."User"',
    'AFTER UPDATE OR DELETE ON public."SellerAccess"',
    'TG_OP = \'DELETE\' OR OLD."userId" IS DISTINCT FROM NEW."userId"',
    'BEFORE INSERT ON public."UserBlock"',
    "RAISE WARNING 'Realtime message hint failed (SQLSTATE %).', SQLSTATE",
    'CREATE TRIGGER message_buyer_reply_activation\nAFTER INSERT ON public."Message"',
    'CREATE TRIGGER message_moderation_broadcast\nAFTER UPDATE OF "moderationStatus" ON public."Message"',
    'coalesce("moderationUpdatedAt" + interval \'1 millisecond\', \'-infinity\'::timestamp)',
    'SET status = \'ACCEPTED\',\n      "viewedAt" = coalesce(invite."viewedAt", now()),\n      "respondedAt" = coalesce(invite."respondedAt", now())',
    "New invites must include current guided opening metadata and begin in SENT status.",
    "review existing permissive authenticated Realtime SELECT policies",
    "browser Realtime Broadcast INSERT policies must be removed",
  ];
  for (const fragment of requiredMigrationFragments) requireFragment(migration, fragment, "migration");

  for (const model of ["Conversation", "ConversationParticipant", "Message", "UserBlock", "MessageReport"]) {
    requireFragment(schema, `model ${model} {`, "Prisma schema");
  }
  requireFragment(schema, "@@index([conversationId, senderUserId])", "Prisma schema");
  requireFragment(schema, "@@unique([conversationId, clientMessageId])", "Prisma schema");

  if (migration.includes("realtime.broadcast_changes")) {
    throw new Error("Messaging migration must use identifier-only realtime.send, not broadcast_changes.");
  }
  if (/CREATE POLICY[\s\S]*?ON realtime\.messages[\s\S]*?FOR INSERT/i.test(migration)) {
    throw new Error("Messaging migration must not grant browsers a Realtime Broadcast INSERT policy.");
  }
  if (/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?public\."(?:Conversation|ConversationParticipant|Message|UserBlock|MessageReport)"[\s\S]*?TO\s+service_role/i.test(migration)) {
    throw new Error("Messaging tables must not expose raw content to the Supabase service role.");
  }
  if (count(migration, "OR 'anon'::name = ANY(policy.roles)") !== 2) {
    throw new Error("Realtime policy preflight must reject permissive anon receive and send policies.");
  }
  if (count(migration, "\nBEGIN;\n") !== 1 || !migration.trimEnd().endsWith("COMMIT;")) {
    throw new Error("Messaging migration must be one explicit PostgreSQL transaction.");
  }
  if (count(migration, "'messaging-pair:'") < 3) {
    throw new Error("Send, invite, and block paths must share the canonical messaging pair lock.");
  }
  const userEligibilityStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app_private.close_user_conversations_on_eligibility_loss()",
  );
  const userEligibilityEnd = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app_private.close_seller_conversations_on_access_loss()",
  );
  const userEligibility = migration.slice(userEligibilityStart, userEligibilityEnd);
  requireFragment(
    userEligibility,
    "SELECT conversation.id, participant.role",
    "single ordered user role-loss lock set",
  );
  if (count(userEligibility, "FOR affected IN") !== 2) {
    throw new Error("User eligibility closure must use one suspension loop and one globally ordered role-loss loop.");
  }
  const messageRulesStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app_private.enforce_message_insert()",
  );
  const messageRulesEnd = migration.indexOf(
    "REVOKE ALL ON FUNCTION app_private.enforce_message_insert()",
    messageRulesStart,
  );
  const messageRules = migration.slice(messageRulesStart, messageRulesEnd);
  const messageLockOrder = [
    "PERFORM pg_advisory_xact_lock(hashtextextended(\n    'messaging-pair:'",
    "PERFORM invite.id\n  FROM public.\"Invite\" invite",
    "SELECT\n    conversation.status",
    "hashtextextended('messaging-sender:'",
  ].map((fragment) => messageRules.indexOf(fragment));
  if (messageLockOrder.some((index) => index < 0)
    || messageLockOrder.some((index, position) => position > 0 && index <= messageLockOrder[position - 1])) {
    throw new Error("Message authorization locks are not in pair/invite/conversation/sender order.");
  }
  const blockRulesStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app_private.apply_user_block()",
  );
  const blockRulesEnd = migration.indexOf(
    "REVOKE ALL ON FUNCTION app_private.apply_user_block()",
    blockRulesStart,
  );
  const blockRules = migration.slice(blockRulesStart, blockRulesEnd);
  const blockLockOrder = [
    "PERFORM pg_advisory_xact_lock(hashtextextended(\n    'messaging-pair:'",
    "PERFORM invite.id\n  FROM public.\"Invite\" invite",
    "FOR affected IN\n    SELECT conversation.id",
  ].map((fragment) => blockRules.indexOf(fragment));
  if (blockLockOrder.some((index) => index < 0)
    || blockLockOrder.some((index, position) => position > 0 && index <= blockLockOrder[position - 1])) {
    throw new Error("Permanent blocking locks are not in pair/invite/conversation order.");
  }
  requireFragment(
    blockRules,
    "WHERE outbox.type = 'MESSAGE_UNREAD'",
    "block unread-message cancellation",
  );
  const inviteRulesStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()",
  );
  const inviteRulesEnd = migration.indexOf(
    "REVOKE ALL ON FUNCTION app_private.enforce_invite_rules()",
    inviteRulesStart,
  );
  const inviteRules = migration.slice(inviteRulesStart, inviteRulesEnd);
  const lockOrder = [
    'SELECT buyer_profile."userId"',
    "PERFORM app_user.id",
    'SELECT buyer_profile."visibilityStatus", buyer_profile."userId"',
    "SELECT access.status",
    'SELECT property."ownershipVerificationStatus", property.status',
    "PERFORM pg_advisory_xact_lock(hashtextextended(\n    'messaging-pair:'",
  ].map((fragment) => inviteRules.indexOf(fragment));
  if (lockOrder.some((index) => index < 0)
    || lockOrder.some((index, position) => position > 0 && index <= lockOrder[position - 1])) {
    throw new Error("Invite eligibility locks are not in canonical user/profile/access/property/pair order.");
  }
  requireFragment(
    inviteRules,
    'WHERE app_user.id IN (NEW."sellerId", buyer_user_id)\n  ORDER BY app_user.id\n  FOR SHARE',
    "invite eligibility lock",
  );
  requireFragment(
    inviteRules,
    'WHERE buyer_profile.id = NEW."buyerProfileId"\n  FOR SHARE',
    "invite buyer profile revalidation lock",
  );
  if (count(migration, "ALTER TABLE public.\"") < 5) {
    throw new Error("Messaging migration is missing expected table hardening statements.");
  }
  if (count(migration, "$$") % 2 !== 0) {
    throw new Error("Messaging migration contains an unbalanced dollar-quoted function body.");
  }

  process.stdout.write(`${JSON.stringify({
    mode,
    migration: migrationName,
    inviteEligibilityLockOrder: "users-by-UUID, buyer-profile, seller-access, property, pair",
    pairLockSites: count(migration, "'messaging-pair:'"),
    realtime: "identifier-only private Broadcast receive policy",
    reportEvidence: "trigger-derived reported message plus at most six nearby messages",
    status: "passed",
  }, null, 2)}\n`);
}

async function runFreshProof() {
  const testUrl = process.env.MESSAGING_MIGRATION_TEST_DATABASE_URL;
  await assertDisposableDatabase(testUrl, "MESSAGING_MIGRATION_TEST_ALLOW_RESET");

  const testEnv = { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl };
  run(process.platform === "win32" ? "npx.cmd" : "npx", [
    "prisma",
    "migrate",
    "reset",
    "--force",
    "--schema",
    "packages/db/prisma/schema.prisma",
  ], testEnv);

  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await restoreSentinel(client);
    await assertExactMigrationLedger(client);
    const catalog = await assertMessagingCatalog(client);

    let fixture;
    await client.query("BEGIN");
    try {
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      fixture = await seedFixture(client, { legacy: false });
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const backfill = await assertConversationRows(client, fixture.expected);
    await client.query("BEGIN");
    let behavior;
    try {
      behavior = await assertSqlBehavior(client, fixture, { includeBlockBarrier: false });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    const eligibilityBarrier = await assertConcurrentEligibilityBarrier(testUrl, fixture);
    const inviteRetry = await assertConcurrentInviteRetry(testUrl, fixture);
    const reciprocalInvites = await assertConcurrentReciprocalInvites(testUrl, fixture);
    const realtimeAuthorization = await assertRealtimeSqlAuthorization(client, fixture);
    const blockSend = await assertConcurrentBlockBarrier(testUrl, fixture);
    process.stdout.write(`${JSON.stringify({
      backfill,
      behavior,
      blockSend,
      catalog,
      eligibilityBarrier,
      inviteRetry,
      mode,
      reciprocalInvites,
      realtimeAuthorization,
      status: "passed",
    }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

async function runUpgradeProof() {
  const testUrl = process.env.MESSAGING_MIGRATION_TEST_DATABASE_URL;
  await assertDisposableDatabase(testUrl, "MESSAGING_MIGRATION_TEST_ALLOW_WRITES");
  const migration = migrationBodyForRollbackProof(await readFile(migrationPath, "utf8"));
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await assertUpgradeBaseline(client);
    const before = await baselineCounts(client);
    await client.query("BEGIN");
    try {
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const fixture = await seedFixture(client, { legacy: true });
      await client.query(migration);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const catalog = await assertMessagingCatalog(client);
      const backfill = await assertConversationRows(client, fixture.expected);
      const outboxPrivacy = await assertOutboxPrivacy(client, fixture);
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const behavior = await assertSqlBehavior(client, fixture, { includeBlockBarrier: true });
      await client.query("ROLLBACK");
      const recovery = await assertRolledBackUpgrade(client, before, fixture);
      process.stdout.write(`${JSON.stringify({
        backfill,
        behavior,
        catalog,
        mode,
        outboxPrivacy,
        recovery,
        status: "passed",
      }, null, 2)}\n`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function seedFixture(db, { legacy }) {
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  const suffix = randomUUID();
  const buyerProfileId = `messaging-buyer-${suffix}`;
  const propertyOneId = `messaging-property-one-${suffix}`;
  const propertyTwoId = `messaging-property-two-${suffix}`;
  const propertyThreeId = `messaging-property-three-${suffix}`;
  const propertyFourId = `messaging-property-four-${suffix}`;
  const propertyFiveId = `messaging-property-five-${suffix}`;
  const propertySixId = `messaging-property-six-${suffix}`;

  await insertAuthUser(db, sellerId, `messaging-seller-${suffix}@example.invalid`);
  await insertAuthUser(db, buyerId, `messaging-buyer-${suffix}@example.invalid`);
  await db.query(
    `UPDATE public."User"
     SET roles = CASE WHEN id = $1 THEN ARRAY['SELLER']::public."UserRole"[]
                      ELSE ARRAY['BUYER']::public."UserRole"[] END
     WHERE id IN ($1, $2)`,
    [sellerId, buyerId],
  );
  await db.query(
    `INSERT INTO public."SellerAccess" (id, "userId", status, "reviewedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 'APPROVED', now(), now(), now())`,
    [`messaging-access-${suffix}`, sellerId],
  );

  const area = await db.query(`
    SELECT area.id
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE area.active AND market.active
    ORDER BY area.id
    LIMIT 1
  `);
  if (!area.rows[0]?.id) {
    throw new Error("Messaging migration fixture requires one active service area in an active market.");
  }

  await db.query(
    `INSERT INTO public."BuyerProfile" (
       id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'Cedar Harbor', 'DRAFT', now(), now())`,
    [buyerProfileId, buyerId],
  );
  await db.query(
    `INSERT INTO public."BuyerCriteria" (
       id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`,
    [`messaging-criteria-${suffix}`, buyerProfileId],
  );
  await db.query(
    `INSERT INTO public.buyer_desired_service_areas (
       buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
     ) VALUES ($1, $2, 'SELECTED', true, now(), now())`,
    [buyerProfileId, area.rows[0].id],
  );
  await db.query(
    `UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now() WHERE id = $1`,
    [buyerProfileId],
  );

  for (const [propertyId, address, price] of [
    [propertyOneId, "100 Messaging Way", 850000],
    [propertyTwoId, "200 Messaging Way", 950000],
    [propertyThreeId, "300 Messaging Way", 1050000],
    [propertyFourId, "400 Messaging Way", 1150000],
    [propertyFiveId, "500 Messaging Way", 1250000],
    [propertySixId, "600 Messaging Way", 1350000],
  ]) {
    await db.query(
      `INSERT INTO public."SellerProperty" (
         id, "ownerUserId", "addressLine1", city, state, zip, "propertyType", features, price,
         "ownershipVerificationStatus", status, "identityVersion", "authorityAttestedAt",
         "authorityAttestedByUserId", "attestationVersion", "authorityAttestedIdentityVersion",
         "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, 'Los Angeles', 'CA', '90001', 'HOME', ARRAY[]::text[], $4,
         'APPROVED', 'READY_FOR_INVITES', 1, now(), $2, 'messaging-test-v1', 1, now(), now()
       )`,
      [propertyId, sellerId, address, price],
    );
  }

  if (!legacy) {
    const sentInviteId = `messaging-fresh-sent-${suffix}`;
    const acceptedInviteId = `messaging-fresh-accepted-${suffix}`;
    const declinedInviteId = `messaging-fresh-declined-${suffix}`;
    await db.query(
      `INSERT INTO public."Invite" (
         id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion",
         title, message, "openingTemplateKey", "openingTemplateVersion", "openingNote",
         status, "sentAt", "expiresAt", "createdAt", "updatedAt"
       ) VALUES
         ($1, $4, $5, $6, 1, '100 Messaging Way',
          'Would you like to schedule a private viewing? Weekends work well.',
          'SELLER_PRIVATE_VIEWING', 1, 'Weekends work well.',
          'SENT', now(), now() + interval '30 days', now(), now()),
         ($2, $4, $5, $7, 1, '200 Messaging Way',
          'Would you like more photos or property details?',
          'SELLER_MORE_DETAILS', 1, NULL,
          'SENT', now() - interval '1 day', now() + interval '29 days',
          now() - interval '1 day', now() - interval '1 day'),
         ($3, $4, $5, $8, 1, '300 Messaging Way',
          'Would you like to discuss the property and possible next steps?',
          'SELLER_NEXT_STEPS', 1, NULL,
          'SENT', now() - interval '2 days', now() + interval '28 days',
          now() - interval '2 days', now() - interval '2 days')`,
      [
        sentInviteId,
        acceptedInviteId,
        declinedInviteId,
        sellerId,
        buyerProfileId,
        propertyOneId,
        propertyTwoId,
        propertyThreeId,
      ],
    );
    await db.query(
      `UPDATE public."Invite"
       SET status = CASE id WHEN $1 THEN 'ACCEPTED'::public."InviteStatus"
                            ELSE 'DECLINED'::public."InviteStatus" END,
           "respondedAt" = now(),
           "updatedAt" = now()
       WHERE id IN ($1, $2)`,
      [acceptedInviteId, declinedInviteId],
    );
    return {
      authUserIds: [sellerId, buyerId],
      buyerId,
      buyerProfileId,
      inviteIds: [sentInviteId, acceptedInviteId, declinedInviteId],
      propertyFourId,
      propertyFiveId,
      propertySixId,
      propertyThreeId,
      sellerId,
      expected: [
        { closedReason: null, id: sentInviteId, status: "AWAITING_BUYER" },
        { closedReason: null, id: acceptedInviteId, status: "ACTIVE" },
        { closedReason: "INVITE_DECLINED", id: declinedInviteId, status: "READ_ONLY" },
      ],
    };
  }

  const sentInviteId = `messaging-sent-invite-${suffix}`;
  const acceptedInviteId = `messaging-accepted-invite-${suffix}`;
  const declinedInviteId = `messaging-declined-invite-${suffix}`;
  const ownershipMismatchInviteId = `messaging-ownership-mismatch-${suffix}`;
  const outboxId = `messaging-legacy-outbox-${suffix}`;
  await db.query(
    `INSERT INTO public."Invite" (
       id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion",
       title, message, status, "sentAt", "expiresAt", "createdAt", "updatedAt"
     ) VALUES
       ($1, $4, $5, $6, 1, '100 Messaging Way', 'Legacy sent invitation.',
        'SENT', now() - interval '1 day', NULL, now() - interval '1 day', now() - interval '1 day'),
       ($2, $4, $5, $7, 1, '200 Messaging Way', 'Legacy accepted invitation.',
        'ACCEPTED', now() - interval '60 days', NULL, now() - interval '60 days', now() - interval '60 days'),
       ($3, $4, $5, $6, 1, '100 Messaging Way', 'Legacy declined invitation.',
        'DECLINED', now() - interval '2 days', NULL, now() - interval '2 days', now() - interval '2 days')`,
    [sentInviteId, acceptedInviteId, declinedInviteId, sellerId, buyerProfileId, propertyOneId, propertyTwoId],
  );
  await db.query(
    `INSERT INTO public."Invite" (
       id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion",
       title, message, status, "sentAt", "expiresAt", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, 1, 'Legacy ownership mismatch',
       'Legacy invitation whose property ownership later became inconsistent.',
       'SENT', now() - interval '1 day', NULL, now() - interval '1 day', now() - interval '1 day'
     )`,
    [ownershipMismatchInviteId, sellerId, buyerProfileId, propertySixId],
  );
  await db.query(
    `UPDATE public."SellerProperty"
     SET "ownerUserId" = $1,
         "authorityAttestedByUserId" = $1,
         "updatedAt" = now()
     WHERE id = $2`,
    [buyerId, propertySixId],
  );
  await db.query(
    `INSERT INTO public."EmailOutbox" (
       id, type, "to", payload, status, "idempotencyKey", "inviteId", "createdAt", "updatedAt"
     ) VALUES (
       $1, 'INVITE', $2,
       jsonb_build_object('message', 'Legacy sensitive invite body.', 'note', 'Legacy sensitive note.'),
       'PENDING', $3, $4, now(), now()
     )`,
    [outboxId, `messaging-buyer-${suffix}@example.invalid`, `messaging-legacy-outbox-key-${suffix}`, sentInviteId],
  );
  return {
    authUserIds: [sellerId, buyerId],
    buyerId,
    buyerProfileId,
    inviteIds: [sentInviteId, acceptedInviteId, declinedInviteId, ownershipMismatchInviteId],
    outboxId,
    propertyFourId,
    propertyFiveId,
    propertySixId,
    propertyThreeId,
    sellerId,
    expected: [
      { closedReason: null, id: sentInviteId, status: "AWAITING_BUYER" },
      { closedReason: null, id: acceptedInviteId, status: "ACTIVE" },
      { closedReason: "INVITE_DECLINED", id: declinedInviteId, status: "READ_ONLY" },
      {
        closedReason: "PROPERTY_INELIGIBLE",
        id: ownershipMismatchInviteId,
        propertyContextUnavailable: true,
        status: "READ_ONLY",
      },
    ],
  };
}

async function assertConversationRows(db, expected) {
  const result = await db.query(
    `SELECT
       invite.id,
       invite.status::text AS invite_status,
       invite."expiresAt" AS expires_at,
       conversation.status::text AS conversation_status,
       conversation."closedReason"::text AS closed_reason,
       conversation."propertySnapshot" AS property_snapshot,
       (SELECT count(*)::int FROM public."ConversationParticipant" participant
        WHERE participant."conversationId" = conversation.id) AS participants,
       (SELECT count(*)::int FROM public."ConversationParticipant" participant
        WHERE participant."conversationId" = conversation.id AND participant.role = 'SELLER') AS sellers,
       (SELECT count(*)::int FROM public."ConversationParticipant" participant
        WHERE participant."conversationId" = conversation.id AND participant.role = 'BUYER') AS buyers,
       (SELECT count(*)::int FROM public."Message" message
        WHERE message."conversationId" = conversation.id AND message.kind = 'INVITE') AS invite_messages,
       (SELECT jsonb_build_object('body', message.body, 'senderUserId', message."senderUserId")
        FROM public."Message" message
        WHERE message."conversationId" = conversation.id AND message.kind = 'INVITE') AS invite_message
     FROM public."Invite" invite
     JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
     WHERE invite.id = ANY($1::text[])
     ORDER BY invite.id`,
    [expected.map((item) => item.id)],
  );
  if (result.rowCount !== expected.length) {
    throw new Error(`Expected ${expected.length} invite conversations, received ${result.rowCount}.`);
  }

  for (const expectation of expected) {
    const row = result.rows.find((candidate) => candidate.id === expectation.id);
    if (!row) throw new Error(`Missing conversation backfill for invite ${expectation.id}.`);
    assertEqual(row.conversation_status, expectation.status, `${expectation.id} conversation status`);
    assertEqual(row.closed_reason, expectation.closedReason, `${expectation.id} closed reason`);
    assertEqual(row.participants, 2, `${expectation.id} participant count`);
    assertEqual(row.sellers, 1, `${expectation.id} seller participant count`);
    assertEqual(row.buyers, 1, `${expectation.id} buyer participant count`);
    assertEqual(row.invite_messages, 1, `${expectation.id} invite message count`);
    if (!row.expires_at) throw new Error(`${expectation.id} did not receive a non-null expiry.`);
    if (!row.invite_message?.senderUserId) throw new Error(`${expectation.id} invite message has no seller sender.`);
    if (!row.invite_message?.body?.trim()) throw new Error(`${expectation.id} invite message has no body snapshot.`);
    if (!row.property_snapshot?.propertyIdentityVersion) {
      throw new Error(`${expectation.id} property snapshot has no identity version.`);
    }
    if (expectation.propertyContextUnavailable) {
      if (row.property_snapshot.contextUnavailable !== true
        || row.property_snapshot.addressLine1
        || row.property_snapshot.ownershipVerificationStatus) {
        throw new Error(`${expectation.id} exposed property context for an ownership-mismatched invite.`);
      }
    } else if (!row.property_snapshot?.ownershipVerificationStatus) {
      throw new Error(`${expectation.id} property snapshot has no ownership status.`);
    }
  }

  return {
    conversations: result.rowCount,
    exactParticipants: result.rows.every((row) => row.participants === 2 && row.sellers === 1 && row.buyers === 1),
    inviteMessages: result.rows.reduce((sum, row) => sum + row.invite_messages, 0),
  };
}

async function assertOutboxPrivacy(db, fixture) {
  if (!fixture.outboxId) return { legacyInviteRowsScrubbed: 0 };
  const result = await db.query(
    `SELECT payload FROM public."EmailOutbox" WHERE id = $1`,
    [fixture.outboxId],
  );
  if (result.rowCount !== 1 || Object.keys(result.rows[0].payload ?? {}).length !== 0) {
    throw new Error("Legacy invite outbox payload was not scrubbed to an empty object.");
  }
  return { legacyInviteRowsScrubbed: 1 };
}

async function assertSqlBehavior(db, fixture, { includeBlockBarrier }) {
  const conversations = await db.query(
    `SELECT conversation.id, conversation.status::text AS status, conversation."inviteId" AS invite_id
     FROM public."Conversation" conversation
     WHERE conversation."inviteId" = ANY($1::text[])`,
    [fixture.inviteIds],
  );
  const acceptedInvite = fixture.expected.find((item) => item.status === "ACTIVE");
  const awaitingInvite = fixture.expected.find((item) => item.status === "AWAITING_BUYER");
  const declinedInvite = fixture.expected.find((item) => item.status === "READ_ONLY");
  const accepted = conversations.rows.find((row) => row.invite_id === acceptedInvite?.id);
  const awaiting = conversations.rows.find((row) => row.invite_id === awaitingInvite?.id);
  const declined = conversations.rows.find((row) => row.invite_id === declinedInvite?.id);
  if (!accepted?.id || !awaiting?.id || !declined?.id) {
    throw new Error("Messaging behavior fixture is missing lifecycle conversations.");
  }

  const acceptedExpiry = await db.query(
    `SELECT "expiresAt" < now() AS expired FROM public."Invite" WHERE id = $1`,
    [acceptedInvite.id],
  );
  if (!acceptedExpiry.rows[0]?.expired) {
    throw new Error("Accepted-continuation fixture must have an expired invite timestamp.");
  }

  const idempotencyId = randomUUID();
  const idempotentBody = "Accepted conversations remain messageable after invite expiry.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await db.query(
      `INSERT INTO public."Message" (
         "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
       ) VALUES ($1, $2, 'FREE_TEXT', $3, $4, 'ALLOWED', now())
       ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING`,
      [accepted.id, fixture.buyerId, idempotentBody, idempotencyId],
    );
  }
  const idempotent = await db.query(
    `SELECT id FROM public."Message"
     WHERE "conversationId" = $1 AND "clientMessageId" = $2`,
    [accepted.id, idempotencyId],
  );
  assertEqual(idempotent.rowCount, 1, "client message idempotency count");
  const reportedMessageId = idempotent.rows[0].id;

  await db.query(
    `UPDATE public."Message"
     SET "moderationStatus" = 'FLAGGED'
     WHERE id = $1`,
    [reportedMessageId],
  );
  const firstModerationRevision = await db.query(
    `SELECT "moderationUpdatedAt" AS revision
     FROM public."Conversation"
     WHERE id = $1`,
    [accepted.id],
  );
  await db.query(
    `UPDATE public."Message"
     SET "moderationStatus" = 'REDACTED'
     WHERE id = $1`,
    [reportedMessageId],
  );
  const secondModerationRevision = await db.query(
    `SELECT "moderationUpdatedAt" AS revision
     FROM public."Conversation"
     WHERE id = $1`,
    [accepted.id],
  );
  const firstRevisionTime = firstModerationRevision.rows[0]?.revision?.getTime?.();
  const secondRevisionTime = secondModerationRevision.rows[0]?.revision?.getTime?.();
  if (!Number.isFinite(firstRevisionTime) || !Number.isFinite(secondRevisionTime)
      || secondRevisionTime <= firstRevisionTime) {
    throw new Error("Rapid moderation updates must advance the conversation revision strictly.");
  }

  const inviteMessage = await db.query(
    `SELECT "clientMessageId" AS client_message_id
     FROM public."Message"
     WHERE "conversationId" = $1 AND kind = 'INVITE'`,
    [awaiting.id],
  );
  if (!inviteMessage.rows[0]?.client_message_id) {
    throw new Error("Buyer-reply conflict fixture has no invite message client ID.");
  }
  await db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', 'Conflicting reply must not activate.', $3, 'ALLOWED', now())
     ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING`,
    [awaiting.id, fixture.buyerId, inviteMessage.rows[0]?.client_message_id],
  );
  const conflictState = await db.query(
    `SELECT conversation.status::text AS conversation_status, invite.status::text AS invite_status
     FROM public."Conversation" conversation
     JOIN public."Invite" invite ON invite.id = conversation."inviteId"
     WHERE conversation.id = $1`,
    [awaiting.id],
  );
  assertEqual(conflictState.rows[0]?.conversation_status, "AWAITING_BUYER", "conflicting reply conversation status");
  if (!["SENT", "VIEWED"].includes(conflictState.rows[0]?.invite_status)) {
    throw new Error("A conflicting buyer message changed invite acceptance state.");
  }

  await db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', 'Buyer first reply accepts the conversation.', $3, 'ALLOWED', now())`,
    [awaiting.id, fixture.buyerId, randomUUID()],
  );
  const buyerReplyState = await db.query(
    `SELECT conversation.status::text AS conversation_status,
            invite.status::text AS invite_status,
            invite."respondedAt" AS responded_at
     FROM public."Conversation" conversation
     JOIN public."Invite" invite ON invite.id = conversation."inviteId"
     WHERE conversation.id = $1`,
    [awaiting.id],
  );
  assertEqual(buyerReplyState.rows[0]?.conversation_status, "ACTIVE", "buyer reply conversation status");
  assertEqual(buyerReplyState.rows[0]?.invite_status, "ACCEPTED", "buyer reply invite status");
  if (!buyerReplyState.rows[0]?.responded_at) {
    throw new Error("Buyer first reply did not persist the invite response timestamp.");
  }
  await db.query(
    `UPDATE public."Invite" SET "expiresAt" = now() - interval '1 day', "updatedAt" = now()
     WHERE id = $1`,
    [awaitingInvite.id],
  );
  await db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', 'Accepted reply remains messageable after the original deadline.', $3, 'ALLOWED', now())`,
    [awaiting.id, fixture.sellerId, randomUUID()],
  );

  await expectPgError(db, () => db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', 'Closed conversation attempt.', $3, 'ALLOWED', now())`,
    [declined.id, fixture.buyerId, randomUUID()],
  ), "42501");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'INVITE', 'Forged buyer invite.', $3, 'ALLOWED', now())`,
    [accepted.id, fixture.buyerId, randomUUID()],
  ), "23514", "Invite message sender");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', 'Outsider attempt.', $3, 'ALLOWED', now())`,
    [accepted.id, randomUUID(), randomUUID()],
  ), "42501");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', E'\n\t\n', $3, 'ALLOWED', now())`,
    [accepted.id, fixture.buyerId, randomUUID()],
  ), "23514");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."Message" (
       "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
     ) VALUES ($1, $2, 'FREE_TEXT', $3, $4, 'ALLOWED', now())`,
    [accepted.id, fixture.buyerId, ` ${"x".repeat(2000)} `, randomUUID()],
  ), "23514");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."EmailOutbox" (
       id, type, "to", payload, status, "idempotencyKey", "inviteId", "createdAt", "updatedAt"
     ) VALUES ($1, 'INVITE', 'privacy@example.invalid', '{"message":"must not persist"}'::jsonb,
               'PENDING', $2, $3, now(), now())`,
    [`messaging-private-outbox-${randomUUID()}`, `messaging-private-outbox-key-${randomUUID()}`, acceptedInvite.id],
  ), "23514");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."EmailOutbox" (
       id, type, "to", payload, status, "idempotencyKey",
       "messageConversationId", "messageRecipientUserId", "createdAt", "updatedAt"
     ) VALUES ($1, 'MESSAGE_UNREAD', 'privacy@example.invalid', '{"body":"must not persist"}'::jsonb,
               'PENDING', $2, $3, $4, now(), now())`,
    [
      `messaging-private-unread-${randomUUID()}`,
      `messaging-private-unread-key-${randomUUID()}`,
      accepted.id,
      fixture.sellerId,
    ],
  ), "23514");

  await expectPgError(db, () => db.query(
    `INSERT INTO public."EmailOutbox" (
       id, type, "to", payload, status, "idempotencyKey", "createdAt", "updatedAt"
     ) VALUES ($1, 'MESSAGE_UNREAD', 'privacy@example.invalid', '{}'::jsonb,
               'PENDING', $2, now(), now())`,
    [
      `messaging-unbound-unread-${randomUUID()}`,
      `messaging-unbound-unread-key-${randomUUID()}`,
    ],
  ), "23514");

  const reportId = randomUUID();
  await db.query(
    `INSERT INTO public."MessageReport" (
       id, "reporterUserId", "reportedUserId", "conversationId", "messageId", category,
       details, "evidenceBodySnapshot", "evidenceContext", status, "createdAt", "updatedAt"
    ) VALUES ($1, $2, $2, $3, $4, 'SPAM', 'Repeated unwanted contact.',
               'placeholder', '{}'::jsonb, 'OPEN', now(), now())`,
    [reportId, fixture.sellerId, accepted.id, reportedMessageId],
  );
  const report = await db.query(
    `SELECT "reportedUserId", "evidenceBodySnapshot", "evidenceContext", status::text AS status
     FROM public."MessageReport" WHERE id = $1`,
    [reportId],
  );
  const evidence = report.rows[0]?.evidenceContext;
  const surrounding = evidence?.surroundingMessages;
  assertEqual(report.rows[0]?.reportedUserId, fixture.buyerId, "reported user derivation");
  assertEqual(report.rows[0]?.evidenceBodySnapshot, idempotentBody, "reported body snapshot");
  assertEqual(report.rows[0]?.status, "OPEN", "new report status");
  if (!Array.isArray(surrounding) || surrounding.length < 1 || surrounding.length > 7) {
    throw new Error("Report evidence must contain one to seven trigger-derived surrounding messages.");
  }
  if (!surrounding.some((message) => message.messageId === reportedMessageId && message.body === idempotentBody)) {
    throw new Error("Report evidence does not contain the exact reported message.");
  }

  const roleEligibilityLifecycle = await assertRoleEligibilityLifecycle(
    db,
    fixture,
    [accepted.id, awaiting.id],
  );

  const expiryInviteId = `messaging-expiry-${randomUUID()}`;
  await insertNewInvite(db, expiryInviteId, fixture);
  fixture.inviteIds.push(expiryInviteId);
  const expiryConversation = await db.query(
    `SELECT id FROM public."Conversation" WHERE "inviteId" = $1`,
    [expiryInviteId],
  );
  const expiryConversationId = expiryConversation.rows[0]?.id;
  if (!expiryConversationId) throw new Error("Lifecycle expiry fixture has no conversation.");

  const unreadOutboxId = `messaging-unread-outbox-${randomUUID()}`;
  await db.query(
    `INSERT INTO public."EmailOutbox" (
       id, type, "to", payload, status, "idempotencyKey", "inviteId",
       "messageConversationId", "messageRecipientUserId", "createdAt", "updatedAt"
     ) VALUES (
       $1, 'MESSAGE_UNREAD', 'recipient@example.invalid', '{}'::jsonb, 'PENDING', $2, $3,
       $4, $5, now(), now()
     )`,
    [unreadOutboxId, `messaging-unread-outbox-key-${randomUUID()}`, expiryInviteId, expiryConversationId, fixture.buyerId],
  );
  await db.query(
    `UPDATE public."Invite" SET status = 'EXPIRED', "updatedAt" = now() WHERE id = $1`,
    [expiryInviteId],
  );
  const cancelled = await db.query(
    `SELECT status::text AS status FROM public."EmailOutbox" WHERE id = $1`,
    [unreadOutboxId],
  );
  assertEqual(cancelled.rows[0]?.status, "CANCELLED", "closed conversation unread outbox status");

  if (includeBlockBarrier) {
    const blockInviteOutboxId = `messaging-block-invite-outbox-${randomUUID()}`;
    const blockMessageOutboxId = `messaging-block-message-outbox-${randomUUID()}`;
    await db.query(
      `INSERT INTO public."EmailOutbox" (
         id, type, "to", payload, status, "idempotencyKey", "inviteId",
         "createdAt", "updatedAt"
       ) VALUES (
         $1, 'INVITE', 'recipient@example.invalid', '{}'::jsonb, 'PENDING', $2, $3,
         now(), now()
       )`,
      [blockInviteOutboxId, `messaging-block-invite-outbox-key-${randomUUID()}`, acceptedInvite.id],
    );
    await db.query(
      `INSERT INTO public."EmailOutbox" (
         id, type, "to", payload, status, "idempotencyKey",
         "messageConversationId", "messageRecipientUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1, 'MESSAGE_UNREAD', 'recipient@example.invalid', '{}'::jsonb, 'PENDING', $2,
         $3, $4, now(), now()
       )`,
      [
        blockMessageOutboxId,
        `messaging-block-message-outbox-key-${randomUUID()}`,
        accepted.id,
        fixture.sellerId,
      ],
    );
    await db.query(
      `INSERT INTO public."UserBlock" ("blockerUserId", "blockedUserId", reason, "createdAt")
       VALUES ($1, $2, 'Permanent migration proof block.', now())`,
      [fixture.sellerId, fixture.buyerId],
    );
    await expectPgError(db, () => db.query(
      `INSERT INTO public."Message" (
         "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
       ) VALUES ($1, $2, 'FREE_TEXT', 'Post-block attempt.', $3, 'ALLOWED', now())`,
      [accepted.id, fixture.buyerId, randomUUID()],
    ), "42501");
    await expectPgError(db, () => db.query(
      `UPDATE public."UserBlock" SET reason = 'Changed reason.'
       WHERE "blockerUserId" = $1 AND "blockedUserId" = $2`,
      [fixture.sellerId, fixture.buyerId],
    ), "55000", "immutable");
    await expectPgError(db, () => db.query(
      `DELETE FROM public."UserBlock" WHERE "blockerUserId" = $1 AND "blockedUserId" = $2`,
      [fixture.sellerId, fixture.buyerId],
    ), "55000", "permanent");
    await expectPgError(db, () => insertNewInvite(db, `messaging-blocked-invite-${randomUUID()}`, fixture), "42501");

    const closed = await db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'BLOCKED')::int AS blocked
       FROM public."Conversation" WHERE "inviteId" = ANY($1::text[])`,
      [fixture.inviteIds],
    );
    assertEqual(closed.rows[0]?.blocked, closed.rows[0]?.total, "blocked conversation count");

    const blockSideEffects = await db.query(
      `SELECT
         (SELECT status::text FROM public."Invite" WHERE id = $1) AS invite_status,
         (SELECT count(*)::int FROM public."EmailOutbox"
          WHERE id = ANY($2::text[]) AND status = 'CANCELLED') AS cancelled_outbox,
         (SELECT count(*)::int FROM public."Message"
          WHERE "conversationId" = $3
            AND kind = 'SYSTEM'
            AND body = 'This conversation is no longer available.') AS generic_block_notices,
         (SELECT count(*)::int FROM public."Message"
          WHERE "conversationId" = $3
            AND kind = 'SYSTEM'
            AND body LIKE '%invite was withdrawn%') AS withdrawal_notices
      `,
      [acceptedInvite.id, [blockInviteOutboxId, blockMessageOutboxId], accepted.id],
    );
    assertEqual(blockSideEffects.rows[0]?.invite_status, "WITHDRAWN", "blocked pair invite status");
    assertEqual(blockSideEffects.rows[0]?.cancelled_outbox, 2, "blocked pair outbox cancellation count");
    assertEqual(blockSideEffects.rows[0]?.generic_block_notices, 1, "generic block notice count");
    assertEqual(blockSideEffects.rows[0]?.withdrawal_notices, 0, "block-specific withdrawal notice count");
  }

  return {
    acceptedExpiredContinuation: true,
    blockBarrier: includeBlockBarrier,
    blockSideEffectsAuthoritative: includeBlockBarrier,
    buyerReplyPersistsAcceptance: true,
    idempotentClientMessage: true,
    inviteSenderBound: true,
    lifecycleRejection: true,
    lifecycleUnreadOutboxCancelled: true,
    outboxContentFreeConstraint: true,
    outboxUnreadReferencesRequired: true,
    reportEvidenceBounded: true,
    roleEligibilityLifecycle,
    whitespaceAndPaddingRejected: true,
  };
}

async function assertRoleEligibilityLifecycle(db, fixture, conversationIds) {
  await withinSavepoint(db, "messaging_admin_bypass", async () => {
    await db.query(
      `UPDATE public."User"
       SET roles = ARRAY['ADMIN']::public."UserRole"[], "updatedAt" = now()
       WHERE id = $1`,
      [fixture.sellerId],
    );
    await db.query(
      `UPDATE public."SellerAccess"
       SET status = 'REJECTED', "updatedAt" = now()
       WHERE "userId" = $1`,
      [fixture.sellerId],
    );
    const open = await db.query(
      `SELECT count(*)::int AS total
       FROM public."Conversation"
       WHERE id = ANY($1::uuid[]) AND status IN ('AWAITING_BUYER', 'ACTIVE')`,
      [conversationIds],
    );
    assertEqual(open.rows[0]?.total, conversationIds.length, "active admin messaging bypass");
  });

  await withinSavepoint(db, "messaging_seller_role_loss", async () => {
    await db.query(
      `UPDATE public."User"
       SET roles = ARRAY[]::public."UserRole"[], "updatedAt" = now()
       WHERE id = $1`,
      [fixture.sellerId],
    );
    await assertConversationsClosed(db, conversationIds, "SELLER_INELIGIBLE", "seller role loss");
    await expectPgError(
      db,
      () => insertNewInvite(db, `messaging-roleless-seller-${randomUUID()}`, fixture),
      "42501",
    );
  });

  await withinSavepoint(db, "messaging_buyer_role_loss", async () => {
    await db.query(
      `UPDATE public."User"
       SET roles = ARRAY[]::public."UserRole"[], "updatedAt" = now()
       WHERE id = $1`,
      [fixture.buyerId],
    );
    await assertConversationsClosed(db, conversationIds, "BUYER_INELIGIBLE", "buyer role loss");
    await expectPgError(
      db,
      () => insertNewInvite(db, `messaging-roleless-buyer-${randomUUID()}`, fixture),
      "42501",
    );
  });

  await withinSavepoint(db, "messaging_access_delete", async () => {
    await db.query(
      `DELETE FROM public."SellerAccess" WHERE "userId" = $1`,
      [fixture.sellerId],
    );
    await assertConversationsClosed(db, conversationIds, "SELLER_INELIGIBLE", "seller access deletion");
  });

  return {
    adminBypassPreserved: true,
    buyerRoleLossClosed: true,
    sellerAccessDeleteClosed: true,
    sellerRoleLossClosed: true,
  };
}

async function assertConversationsClosed(db, conversationIds, reason, label) {
  const result = await db.query(
    `SELECT count(*)::int AS total
     FROM public."Conversation"
     WHERE id = ANY($1::uuid[]) AND status = 'READ_ONLY' AND "closedReason" = $2`,
    [conversationIds, reason],
  );
  assertEqual(result.rows[0]?.total, conversationIds.length, `${label} closed conversation count`);
}

async function withinSavepoint(db, name, operation) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid proof savepoint name.");
  await db.query(`SAVEPOINT ${name}`);
  try {
    return await operation();
  } finally {
    await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await db.query(`RELEASE SAVEPOINT ${name}`);
  }
}

async function assertConcurrentEligibilityBarrier(testUrl, fixture) {
  const inviteWriter = new pg.Client({ connectionString: testUrl });
  const eligibilityWriter = new pg.Client({ connectionString: testUrl });
  const verifier = new pg.Client({ connectionString: testUrl });
  const inviteFirstId = `messaging-eligibility-invite-first-${randomUUID()}`;
  const eligibilityFirstId = `messaging-eligibility-loss-first-${randomUUID()}`;
  await Promise.all([inviteWriter.connect(), eligibilityWriter.connect(), verifier.connect()]);
  let inviteOpen = false;
  let eligibilityOpen = false;
  try {
    await inviteWriter.query("BEGIN");
    inviteOpen = true;
    await insertNewInvite(inviteWriter, inviteFirstId, fixture, fixture.propertyFourId);

    await eligibilityWriter.query("BEGIN");
    eligibilityOpen = true;
    let lossSettled = false;
    const propertyLoss = eligibilityWriter.query(
      `UPDATE public."SellerProperty"
       SET status = 'DRAFT', "updatedAt" = now()
       WHERE id = $1`,
      [fixture.propertyFourId],
    ).then(
      (value) => { lossSettled = true; return { value }; },
      (error) => { lossSettled = true; return { error }; },
    );
    await delay(100);
    if (lossSettled) {
      throw new Error("Property eligibility loss did not wait behind the invite's authoritative-row lock.");
    }

    await inviteWriter.query("COMMIT");
    inviteOpen = false;
    const lossResult = await propertyLoss;
    if (lossResult.error) throw lossResult.error;
    await eligibilityWriter.query("COMMIT");
    eligibilityOpen = false;

    const closed = await verifier.query(
      `SELECT conversation.status::text AS status,
              conversation."closedReason"::text AS closed_reason
       FROM public."Conversation" conversation
       WHERE conversation."inviteId" = $1`,
      [inviteFirstId],
    );
    assertEqual(closed.rows[0]?.status, "READ_ONLY", "invite-first eligibility-loss status");
    assertEqual(
      closed.rows[0]?.closed_reason,
      "PROPERTY_INELIGIBLE",
      "invite-first eligibility-loss reason",
    );
    fixture.inviteIds.push(inviteFirstId);

    await eligibilityWriter.query("BEGIN");
    eligibilityOpen = true;
    await eligibilityWriter.query(
      `UPDATE public."SellerProperty"
       SET status = 'DRAFT', "updatedAt" = now()
       WHERE id = $1`,
      [fixture.propertyFiveId],
    );

    await inviteWriter.query("BEGIN");
    inviteOpen = true;
    let inviteSettled = false;
    const blockedInvite = insertNewInvite(
      inviteWriter,
      eligibilityFirstId,
      fixture,
      fixture.propertyFiveId,
    ).then(
      (value) => { inviteSettled = true; return { value }; },
      (error) => { inviteSettled = true; return { error }; },
    );
    await delay(100);
    if (inviteSettled) {
      throw new Error("Invite did not wait behind the authoritative property eligibility mutation.");
    }

    await eligibilityWriter.query("COMMIT");
    eligibilityOpen = false;
    const inviteResult = await blockedInvite;
    if (inviteResult.error?.code !== "42501") {
      throw new Error(
        `Eligibility-first invite expected PostgreSQL 42501, received ${inviteResult.error?.code ?? "success"}.`,
      );
    }
    await inviteWriter.query("ROLLBACK");
    inviteOpen = false;

    const absent = await verifier.query(
      `SELECT
         NOT EXISTS (SELECT 1 FROM public."Invite" WHERE id = $1) AS invite_absent,
         NOT EXISTS (SELECT 1 FROM public."Conversation" WHERE "inviteId" = $1) AS conversation_absent`,
      [eligibilityFirstId],
    );
    if (!absent.rows[0]?.invite_absent || !absent.rows[0]?.conversation_absent) {
      throw new Error("Eligibility-first serialization left an invite or conversation behind.");
    }

    const suspensionBuyerId = randomUUID();
    const suspensionSuffix = randomUUID();
    const suspensionProfileId = `messaging-suspension-buyer-${suspensionSuffix}`;
    const suspensionInviteId = `messaging-suspension-invite-${suspensionSuffix}`;
    await insertAuthUser(
      verifier,
      suspensionBuyerId,
      `messaging-suspension-${suspensionSuffix}@example.invalid`,
    );
    await verifier.query(
      `UPDATE public."User"
       SET roles = ARRAY['BUYER']::public."UserRole"[]
       WHERE id = $1`,
      [suspensionBuyerId],
    );
    await verifier.query(
      `INSERT INTO public."BuyerProfile" (
         id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'Suspension Race Buyer', 'DRAFT', now(), now())`,
      [suspensionProfileId, suspensionBuyerId],
    );
    await verifier.query(
      `INSERT INTO public."BuyerCriteria" (
         id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`,
      [`messaging-suspension-criteria-${suspensionSuffix}`, suspensionProfileId],
    );
    await verifier.query(
      `INSERT INTO public.buyer_desired_service_areas (
         buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
       )
       SELECT $1, existing.service_area_id, 'SELECTED', true, now(), now()
       FROM public.buyer_desired_service_areas existing
       WHERE existing.buyer_profile_id = $2
       ORDER BY existing.service_area_id
       LIMIT 1`,
      [suspensionProfileId, fixture.buyerProfileId],
    );
    await verifier.query(
      `UPDATE public."BuyerProfile"
       SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now()
       WHERE id = $1`,
      [suspensionProfileId],
    );

    await eligibilityWriter.query("BEGIN");
    eligibilityOpen = true;
    await eligibilityWriter.query("SET LOCAL lock_timeout = '2s'");
    await eligibilityWriter.query(
      `UPDATE public."User"
       SET status = 'SUSPENDED', "suspendedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [suspensionBuyerId],
    );

    await inviteWriter.query("BEGIN");
    inviteOpen = true;
    await inviteWriter.query("SET LOCAL lock_timeout = '2s'");
    let suspensionInviteSettled = false;
    const suspensionInvite = insertNewInvite(
      inviteWriter,
      suspensionInviteId,
      fixture,
      fixture.propertySixId,
      { buyerProfileId: suspensionProfileId },
    ).then(
      (value) => { suspensionInviteSettled = true; return { value }; },
      (error) => { suspensionInviteSettled = true; return { error }; },
    );
    await delay(100);
    if (suspensionInviteSettled) {
      throw new Error("Invite did not wait behind the buyer User suspension lock.");
    }

    await eligibilityWriter.query(
      `UPDATE public."BuyerProfile"
       SET "visibilityStatus" = 'SUSPENDED', "updatedAt" = now()
       WHERE id = $1`,
      [suspensionProfileId],
    );
    await eligibilityWriter.query("COMMIT");
    eligibilityOpen = false;
    const suspensionInviteResult = await suspensionInvite;
    if (suspensionInviteResult.error?.code !== "42501") {
      throw new Error(
        `Buyer-suspension invite expected PostgreSQL 42501, received ${suspensionInviteResult.error?.code ?? "success"}.`,
      );
    }
    await inviteWriter.query("ROLLBACK");
    inviteOpen = false;

    const suspensionAbsent = await verifier.query(
      `SELECT
         NOT EXISTS (SELECT 1 FROM public."Invite" WHERE id = $1) AS invite_absent,
         NOT EXISTS (SELECT 1 FROM public."Conversation" WHERE "inviteId" = $1) AS conversation_absent`,
      [suspensionInviteId],
    );
    if (!suspensionAbsent.rows[0]?.invite_absent || !suspensionAbsent.rows[0]?.conversation_absent) {
      throw new Error("Buyer-suspension serialization left an invite or conversation behind.");
    }

    return {
      buyerSuspensionDeniedCode: "42501",
      buyerSuspensionLockOrderSafe: true,
      eligibilityFirstDeniedCode: "42501",
      inviteFirstClosedReason: "PROPERTY_INELIGIBLE",
      rowLockWaitsObserved: 3,
    };
  } finally {
    if (inviteOpen) await inviteWriter.query("ROLLBACK").catch(() => undefined);
    if (eligibilityOpen) await eligibilityWriter.query("ROLLBACK").catch(() => undefined);
    await Promise.all([inviteWriter.end(), eligibilityWriter.end(), verifier.end()]);
  }
}

async function assertConcurrentInviteRetry(testUrl, fixture) {
  const first = new pg.Client({ connectionString: testUrl });
  const second = new pg.Client({ connectionString: testUrl });
  const verifier = new pg.Client({ connectionString: testUrl });
  const firstInviteId = `messaging-concurrent-invite-${randomUUID()}`;
  const secondInviteId = `messaging-concurrent-invite-${randomUUID()}`;
  await Promise.all([first.connect(), second.connect(), verifier.connect()]);
  let firstOpen = false;
  let secondOpen = false;
  try {
    await first.query("BEGIN");
    firstOpen = true;
    await second.query("BEGIN");
    secondOpen = true;
    await insertNewInvite(first, firstInviteId, fixture);

    let settled = false;
    const retry = insertNewInvite(second, secondInviteId, fixture).then(
      (value) => { settled = true; return { value }; },
      (error) => { settled = true; return { error }; },
    );
    await delay(100);
    if (settled) throw new Error("Concurrent invite retry did not wait on the canonical pair/unique boundary.");

    await first.query("COMMIT");
    firstOpen = false;
    const retryResult = await retry;
    if (retryResult.error?.code !== "23505") {
      throw new Error(`Concurrent invite retry expected PostgreSQL 23505, received ${retryResult.error?.code ?? "success"}.`);
    }
    await second.query("ROLLBACK");
    secondOpen = false;

    const result = await verifier.query(
      `SELECT count(*)::int AS invites,
              count(conversation.id)::int AS conversations
       FROM public."Invite" invite
       LEFT JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
       WHERE invite."sellerId" = $1 AND invite."buyerProfileId" = $2 AND invite."propertyId" = $3
         AND invite.status IN ('SENT', 'VIEWED', 'ACCEPTED')`,
      [fixture.sellerId, fixture.buyerProfileId, fixture.propertyThreeId],
    );
    assertEqual(result.rows[0]?.invites, 1, "concurrent invite retry invite count");
    assertEqual(result.rows[0]?.conversations, 1, "concurrent invite retry conversation count");
    fixture.inviteIds.push(firstInviteId);
    return { conversations: 1, invites: 1, loserCode: "23505" };
  } finally {
    if (firstOpen) await first.query("ROLLBACK").catch(() => undefined);
    if (secondOpen) await second.query("ROLLBACK").catch(() => undefined);
    await Promise.all([first.end(), second.end(), verifier.end()]);
  }
}

async function assertConcurrentReciprocalInvites(testUrl, fixture) {
  const first = new pg.Client({ connectionString: testUrl });
  const second = new pg.Client({ connectionString: testUrl });
  const verifier = new pg.Client({ connectionString: testUrl });
  const suffix = randomUUID();
  const sellerBuyerProfileId = `messaging-reciprocal-profile-${suffix}`;
  const buyerPropertyId = `messaging-reciprocal-property-${suffix}`;
  const sellerToBuyerInviteId = `messaging-reciprocal-forward-${suffix}`;
  const buyerToSellerInviteId = `messaging-reciprocal-reverse-${suffix}`;
  await Promise.all([first.connect(), second.connect(), verifier.connect()]);
  let firstOpen = false;
  let secondOpen = false;
  try {
    await verifier.query(
      `UPDATE public."User"
       SET roles = ARRAY['BUYER', 'SELLER']::public."UserRole"[]
       WHERE id IN ($1, $2)`,
      [fixture.sellerId, fixture.buyerId],
    );
    await verifier.query(
      `INSERT INTO public."SellerAccess" (
         id, "userId", status, "reviewedAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'APPROVED', now(), now(), now())`,
      [`messaging-reciprocal-access-${suffix}`, fixture.buyerId],
    );
    await verifier.query(
      `INSERT INTO public."BuyerProfile" (
         id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'Reciprocal Seller Profile', 'DRAFT', now(), now())`,
      [sellerBuyerProfileId, fixture.sellerId],
    );
    await verifier.query(
      `INSERT INTO public."BuyerCriteria" (
         id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())`,
      [`messaging-reciprocal-criteria-${suffix}`, sellerBuyerProfileId],
    );
    await verifier.query(
      `INSERT INTO public.buyer_desired_service_areas (
         buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
       )
       SELECT $1, existing.service_area_id, 'SELECTED', true, now(), now()
       FROM public.buyer_desired_service_areas existing
       WHERE existing.buyer_profile_id = $2
       ORDER BY existing.service_area_id
       LIMIT 1`,
      [sellerBuyerProfileId, fixture.buyerProfileId],
    );
    await verifier.query(
      `UPDATE public."BuyerProfile"
       SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now()
       WHERE id = $1`,
      [sellerBuyerProfileId],
    );
    await verifier.query(
      `INSERT INTO public."SellerProperty" (
         id, "ownerUserId", "addressLine1", city, state, zip, "propertyType", features, price,
         "ownershipVerificationStatus", status, "identityVersion", "authorityAttestedAt",
         "authorityAttestedByUserId", "attestationVersion", "authorityAttestedIdentityVersion",
         "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, '700 Messaging Way', 'Los Angeles', 'CA', '90001', 'HOME', ARRAY[]::text[], 1450000,
         'APPROVED', 'READY_FOR_INVITES', 1, now(), $2, 'messaging-test-v1', 1, now(), now()
       )`,
      [buyerPropertyId, fixture.buyerId],
    );

    await first.query("BEGIN");
    firstOpen = true;
    await first.query("SET LOCAL lock_timeout = '5s'");
    await second.query("BEGIN");
    secondOpen = true;
    await second.query("SET LOCAL lock_timeout = '5s'");

    let firstSettled = false;
    let secondSettled = false;
    let firstResult;
    let secondResult;
    const firstInsert = insertNewInvite(
      first,
      sellerToBuyerInviteId,
      fixture,
      fixture.propertySixId,
    ).then(
      (value) => { firstSettled = true; firstResult = { value }; return firstResult; },
      (error) => { firstSettled = true; firstResult = { error }; return firstResult; },
    );
    const secondInsert = insertNewInvite(
      second,
      buyerToSellerInviteId,
      fixture,
      buyerPropertyId,
      { buyerProfileId: sellerBuyerProfileId, sellerId: fixture.buyerId },
    ).then(
      (value) => { secondSettled = true; secondResult = { value }; return secondResult; },
      (error) => { secondSettled = true; secondResult = { error }; return secondResult; },
    );

    for (let attempt = 0; attempt < 40 && !firstSettled && !secondSettled; attempt += 1) {
      await delay(50);
    }
    if (!firstSettled && !secondSettled) {
      throw new Error("Reciprocal invites failed to reach the canonical pair lock without deadlocking.");
    }

    if (firstSettled) {
      if (firstResult.error) throw firstResult.error;
      await first.query("COMMIT");
      firstOpen = false;
      secondResult = await secondInsert;
      if (secondResult.error) throw secondResult.error;
      await second.query("COMMIT");
      secondOpen = false;
    } else {
      if (secondResult.error) throw secondResult.error;
      await second.query("COMMIT");
      secondOpen = false;
      firstResult = await firstInsert;
      if (firstResult.error) throw firstResult.error;
      await first.query("COMMIT");
      firstOpen = false;
    }

    const result = await verifier.query(
      `SELECT count(*)::int AS invites,
              count(conversation.id)::int AS conversations
       FROM public."Invite" invite
       LEFT JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
       WHERE invite.id = ANY($1::text[])`,
      [[sellerToBuyerInviteId, buyerToSellerInviteId]],
    );
    assertEqual(result.rows[0]?.invites, 2, "reciprocal invite count");
    assertEqual(result.rows[0]?.conversations, 2, "reciprocal conversation count");
    fixture.inviteIds.push(sellerToBuyerInviteId, buyerToSellerInviteId);
    return { conversations: 2, deadlocks: 0, invites: 2, pairSerialized: true };
  } finally {
    if (firstOpen) await first.query("ROLLBACK").catch(() => undefined);
    if (secondOpen) await second.query("ROLLBACK").catch(() => undefined);
    await Promise.all([first.end(), second.end(), verifier.end()]);
  }
}

async function assertRealtimeSqlAuthorization(db, fixture) {
  const conversation = await db.query(
    `SELECT id FROM public."Conversation" WHERE "inviteId" = $1`,
    [fixture.inviteIds[0]],
  );
  const topic = `conversation:${conversation.rows[0]?.id}`;
  await db.query("BEGIN");
  try {
    await setJwtSubject(db, fixture.buyerId);
    const participant = await db.query(
      `SELECT app_private.can_join_conversation_topic($1) AS allowed`,
      [topic],
    );
    await setJwtSubject(db, randomUUID());
    const outsider = await db.query(
      `SELECT app_private.can_join_conversation_topic($1) AS allowed`,
      [topic],
    );
    const malformed = await db.query(
      `SELECT app_private.can_join_conversation_topic('conversation:not-a-uuid') AS allowed`,
    );
    if (!participant.rows[0]?.allowed || outsider.rows[0]?.allowed || malformed.rows[0]?.allowed) {
      throw new Error("Realtime SQL topic authorization did not enforce exact active participation.");
    }
    await db.query("ROLLBACK");
    return { malformedDenied: true, outsiderDenied: true, participantAllowed: true };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function assertConcurrentBlockBarrier(testUrl, fixture) {
  const blocker = new pg.Client({ connectionString: testUrl });
  const sender = new pg.Client({ connectionString: testUrl });
  const verifier = new pg.Client({ connectionString: testUrl });
  const clientMessageId = randomUUID();
  await Promise.all([blocker.connect(), sender.connect(), verifier.connect()]);
  let blockerOpen = false;
  let senderOpen = false;
  try {
    const conversation = await verifier.query(
      `SELECT id FROM public."Conversation" WHERE "inviteId" = $1`,
      [fixture.expected.find((item) => item.status === "ACTIVE")?.id],
    );
    const conversationId = conversation.rows[0]?.id;
    if (!conversationId) throw new Error("Concurrent block fixture has no active conversation.");

    await blocker.query("BEGIN");
    blockerOpen = true;
    await blocker.query(
      `INSERT INTO public."UserBlock" ("blockerUserId", "blockedUserId", reason, "createdAt")
       VALUES ($1, $2, 'Concurrent barrier proof.', now())`,
      [fixture.sellerId, fixture.buyerId],
    );

    await sender.query("BEGIN");
    senderOpen = true;
    let settled = false;
    const send = sender.query(
      `INSERT INTO public."Message" (
         "conversationId", "senderUserId", kind, body, "clientMessageId", "moderationStatus", "createdAt"
       ) VALUES ($1, $2, 'FREE_TEXT', 'Must not cross the block barrier.', $3, 'ALLOWED', now())`,
      [conversationId, fixture.buyerId, clientMessageId],
    ).then(
      (value) => { settled = true; return { value }; },
      (error) => { settled = true; return { error }; },
    );
    await delay(100);
    if (settled) throw new Error("Concurrent send did not wait behind the permanent block pair lock.");

    await blocker.query("COMMIT");
    blockerOpen = false;
    const sendResult = await send;
    if (sendResult.error?.code !== "42501") {
      throw new Error(`Post-block concurrent send expected PostgreSQL 42501, received ${sendResult.error?.code ?? "success"}.`);
    }
    await sender.query("ROLLBACK");
    senderOpen = false;

    const result = await verifier.query(
      `SELECT
         NOT EXISTS (SELECT 1 FROM public."Message" WHERE "clientMessageId" = $1) AS message_absent,
         NOT EXISTS (SELECT 1 FROM public."Conversation" WHERE "inviteId" = ANY($2::text[]) AND status <> 'BLOCKED')
           AS conversations_blocked`,
      [clientMessageId, fixture.inviteIds],
    );
    if (!result.rows[0]?.message_absent || !result.rows[0]?.conversations_blocked) {
      throw new Error("Concurrent block/send barrier leaked a message or left a conversation open.");
    }

    await verifier.query("BEGIN");
    await expectPgError(verifier, () => insertNewInvite(
      verifier,
      `messaging-post-block-invite-${randomUUID()}`,
      fixture,
    ), "42501");
    await expectPgError(verifier, () => verifier.query(
      `DELETE FROM public."UserBlock" WHERE "blockerUserId" = $1 AND "blockedUserId" = $2`,
      [fixture.sellerId, fixture.buyerId],
    ), "55000", "permanent");
    await verifier.query("ROLLBACK");
    return { blockedConversations: true, leakedMessages: 0, loserCode: "42501", permanentBlock: true };
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK").catch(() => undefined);
    if (senderOpen) await sender.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), sender.end(), verifier.end()]);
  }
}

async function insertNewInvite(
  db,
  inviteId,
  fixture,
  propertyId = fixture.propertyThreeId,
  { buyerProfileId = fixture.buyerProfileId, sellerId = fixture.sellerId } = {},
) {
  return db.query(
    `INSERT INTO public."Invite" (
       id, "sellerId", "buyerProfileId", "propertyId", "propertyIdentityVersion",
       title, message, "openingTemplateKey", "openingTemplateVersion", status,
       "sentAt", "expiresAt", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, 1, '300 Messaging Way',
       'Would you like to discuss the property and possible next steps?',
       'SELLER_NEXT_STEPS', 1, 'SENT', now(), now() + interval '30 days', now(), now()
     )`,
    [inviteId, sellerId, buyerProfileId, propertyId],
  );
}

async function expectPgError(db, operation, expectedCode, expectedText) {
  await db.query("SAVEPOINT messaging_expected_error");
  let received;
  try {
    await operation();
  } catch (error) {
    received = error;
  }
  await db.query("ROLLBACK TO SAVEPOINT messaging_expected_error");
  await db.query("RELEASE SAVEPOINT messaging_expected_error");
  if (!received) throw new Error(`Expected PostgreSQL ${expectedCode}, but the statement succeeded.`);
  if (received.code !== expectedCode || (expectedText && !String(received.message).includes(expectedText))) {
    throw new Error(
      `Expected PostgreSQL ${expectedCode}${expectedText ? ` containing ${expectedText}` : ""}, received ${received.code}: ${received.message}`,
      { cause: received },
    );
  }
  return received;
}

async function setJwtSubject(db, userId) {
  await db.query(
    `SELECT set_config('request.jwt.claims', jsonb_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
    [userId],
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function assertMessagingCatalog(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public."Conversation"') IS NOT NULL AS has_conversation,
      to_regclass('public."ConversationParticipant"') IS NOT NULL AS has_participant,
      to_regclass('public."Message"') IS NOT NULL AS has_message,
      to_regclass('public."UserBlock"') IS NOT NULL AS has_block,
      to_regclass('public."MessageReport"') IS NOT NULL AS has_report,
      to_regclass('public."Message_conversationId_senderUserId_idx"') IS NOT NULL AS has_sender_fk_index,
      to_regprocedure('app_private.can_join_conversation_topic(text)') IS NOT NULL AS has_topic_helper,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."EmailOutbox"'::regclass
          AND conname = 'EmailOutbox_messaging_payload_content_free_check'
          AND convalidated
      ) AS has_content_free_outbox_check,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."EmailOutbox"'::regclass
          AND conname = 'EmailOutbox_unread_message_references_check'
          AND convalidated
      ) AS has_unread_reference_check,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."UserBlock"'::regclass
          AND tgname = 'user_block_immutable' AND NOT tgisinternal
      ) AS has_permanent_block_trigger,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."UserBlock"'::regclass
          AND tgname = 'user_block_closes_conversations'
          AND (tgtype & 2) = 2
          AND (tgtype & 4) = 4
          AND NOT tgisinternal
      ) AS has_before_insert_block_closure,
      (SELECT count(*)::int
       FROM pg_class table_class
       JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
       WHERE namespace.nspname = 'public'
         AND table_class.relname IN ('Conversation', 'ConversationParticipant', 'Message', 'UserBlock', 'MessageReport')
         AND table_class.relrowsecurity) AS rls_tables,
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND policyname = 'Active participants can receive conversation broadcasts'
          AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      ) AS private_receive_policy,
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND cmd IN ('SELECT', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
          AND policyname <> 'Active participants can receive conversation broadcasts'
      ) AS no_conflicting_browser_receive_policy,
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND cmd IN ('INSERT', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      ) AS no_browser_broadcast_insert_policy,
      NOT EXISTS (
        SELECT 1
        FROM (VALUES ('anon'), ('authenticated'), ('service_role')) role_name(name)
        CROSS JOIN (VALUES
          ('Conversation'),
          ('ConversationParticipant'),
          ('Message'),
          ('UserBlock'),
          ('MessageReport')
        ) table_name(name)
        CROSS JOIN (VALUES
          ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
          ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
        ) privilege_name(name)
        WHERE has_table_privilege(
          role_name.name,
          format('public.%I', table_name.name),
          privilege_name.name
        )
      ) AS raw_table_access_denied,
      has_function_privilege('authenticated', 'app_private.can_join_conversation_topic(text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'app_private.can_join_conversation_topic(text)', 'EXECUTE')
        AND NOT has_function_privilege('service_role', 'app_private.can_join_conversation_topic(text)', 'EXECUTE')
        AS topic_helper_bounded
  `);
  const row = result.rows[0];
  for (const field of [
    "has_conversation",
    "has_participant",
    "has_message",
    "has_block",
    "has_report",
    "has_sender_fk_index",
    "has_topic_helper",
    "has_content_free_outbox_check",
    "has_unread_reference_check",
    "has_permanent_block_trigger",
    "has_before_insert_block_closure",
    "private_receive_policy",
    "no_conflicting_browser_receive_policy",
    "no_browser_broadcast_insert_policy",
    "raw_table_access_denied",
    "topic_helper_bounded",
  ]) {
    if (!row?.[field]) throw new Error(`Messaging catalog assertion failed: ${field}.`);
  }
  assertEqual(row.rls_tables, 5, "messaging RLS table count");
  return row;
}

async function assertUpgradeBaseline(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public."Invite"') IS NOT NULL AS has_invite,
      to_regclass('public."Conversation"') IS NOT NULL AS has_conversation,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Invite' AND column_name = 'openingTemplateKey'
      ) AS has_opening_template
  `);
  const row = result.rows[0];
  if (!row?.has_invite || row.has_conversation || row.has_opening_template) {
    throw new Error(`Messaging upgrade target is not at the immediate pre-messaging baseline: ${JSON.stringify(row)}`);
  }
  await assertMigrationLedger(db, false, "upgrade baseline");
}

async function assertExactMigrationLedger(db) {
  await assertMigrationLedger(db, true, "fresh migration");
}

async function assertMigrationLedger(db, includeMessagingMigration, label) {
  const directories = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => includeMessagingMigration || name !== migrationName)
    .sort();
  const expected = await Promise.all(directories.map(async (name) => ({
    checksum: createHash("sha256")
      .update(await readFile(path.join(migrationRoot, name, "migration.sql")))
      .digest("hex"),
    migration_name: name,
  })));
  const result = await db.query(`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM public._prisma_migrations
    ORDER BY migration_name, started_at
  `);
  const actual = result.rows;
  const valid = actual.length === expected.length && expected.every((migration, index) => {
    const row = actual[index];
    return row?.migration_name === migration.migration_name
      && row.checksum === migration.checksum
      && row.finished_at != null
      && row.rolled_back_at == null;
  });
  if (!valid) {
    throw new Error(`${label} ledger does not exactly match checked-in migration names, statuses, and checksums.`);
  }
}

async function assertRolledBackUpgrade(db, before, fixture) {
  const after = await baselineCounts(db);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`Upgrade rollback did not restore baseline counts: ${JSON.stringify({ before, after })}`);
  }
  const result = await db.query(
    `SELECT
       to_regclass('public."Conversation"') IS NULL AS messaging_tables_removed,
       NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'Invite' AND column_name = 'openingTemplateKey'
       ) AS invite_shape_restored,
       NOT EXISTS (SELECT 1 FROM public."Invite" WHERE id = ANY($1::text[]))
         AND ($2::text IS NULL OR NOT EXISTS (SELECT 1 FROM public."EmailOutbox" WHERE id = $2))
         AS fixtures_removed`,
    [fixture.inviteIds, fixture.outboxId ?? null],
  );
  const row = result.rows[0];
  if (!row?.messaging_tables_removed || !row.invite_shape_restored || !row.fixtures_removed) {
    throw new Error(`Upgrade rollback recovery assertion failed: ${JSON.stringify(row)}`);
  }
  return { baselineCountsRestored: true, fixtureWritesRemoved: true, messagingDdlRemoved: true };
}

async function baselineCounts(db) {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::int FROM auth.users) AS auth_users,
      (SELECT count(*)::int FROM public."User") AS app_users,
      (SELECT count(*)::int FROM public."BuyerProfile") AS buyer_profiles,
      (SELECT count(*)::int FROM public."EmailOutbox") AS email_outbox,
      (SELECT count(*)::int FROM public."Invite") AS invites,
      (SELECT count(*)::int FROM public."SellerAccess") AS seller_access,
      (SELECT count(*)::int FROM public."SellerProperty") AS properties
  `);
  return result.rows[0];
}

async function insertAuthUser(db, id, email) {
  await db.query(
    `INSERT INTO auth.users (
       id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES ($1, $2, '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}

async function assertDisposableDatabase(url, optInName) {
  const sentinel = process.env.MESSAGING_MIGRATION_TEST_SENTINEL;
  const missing = [
    !url && "MESSAGING_MIGRATION_TEST_DATABASE_URL",
    (!sentinel || sentinel.length < 16) && "MESSAGING_MIGRATION_TEST_SENTINEL (16+ characters)",
    process.env[optInName] !== "true" && `${optInName}=true`,
    !process.env.DIRECT_URL && "DIRECT_URL shared-target deny URL",
    !process.env.DATABASE_URL && "DATABASE_URL shared-target deny URL",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Messaging migration database proof not run: missing ${missing.join(", ")}.`);
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sameDatabaseTarget(sharedUrl, url)) {
      throw new Error("Refusing to run messaging migration proof against the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const result = await guard.query(
      `SELECT to_regclass('public.messaging_migration_test_sentinel') IS NOT NULL AS present,
              EXISTS (
                SELECT 1 FROM public.messaging_migration_test_sentinel WHERE token = $1
              ) AS verified`,
      [sentinel],
    ).catch(async (error) => {
      if (error?.code === "42P01") return { rows: [{ present: false, verified: false }] };
      throw error;
    });
    if (!result.rows[0]?.present || !result.rows[0]?.verified) {
      throw new Error("Disposable messaging migration sentinel is missing or does not match.");
    }
  } finally {
    await guard.end();
  }
}

async function restoreSentinel(db) {
  await db.query(`
    CREATE TABLE public.messaging_migration_test_sentinel (
      token text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query("REVOKE ALL ON public.messaging_migration_test_sentinel FROM PUBLIC, anon, authenticated, service_role");
  await db.query("INSERT INTO public.messaging_migration_test_sentinel(token) VALUES ($1)", [
    process.env.MESSAGING_MIGRATION_TEST_SENTINEL,
  ]);
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.`);
}

function migrationBodyForRollbackProof(source) {
  const withoutBegin = source.replace(/\nBEGIN;\s*\n/, "\n");
  const body = withoutBegin.replace(/\nCOMMIT;\s*$/, "\n");
  if (withoutBegin === source || body === withoutBegin) {
    throw new Error("Messaging migration rollback proof requires one explicit outer transaction.");
  }
  return body;
}

function requireFragment(source, fragment, label) {
  if (!source.includes(fragment)) throw new Error(`${label} is missing required fragment: ${fragment}`);
}

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
