import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const name = "20260716030741_add_loi_negotiations";
const repairName = "20260716120000_harden_loi_event_semantics";
const accessName = "20260717023000_grant_authenticated_app_private_usage";
const defaultAclName = "20260717033000_harden_app_private_function_defaults";
const existing = path.resolve("packages/db/prisma/migrations", name, "migration.sql");
const fresh = path.resolve("packages/db/prisma/current-baseline/migrations", name, "migration.sql");
const repairExisting = path.resolve("packages/db/prisma/migrations", repairName, "migration.sql");
const repairFresh = path.resolve("packages/db/prisma/current-baseline/migrations", repairName, "migration.sql");
const accessExisting = path.resolve("packages/db/prisma/migrations", accessName, "migration.sql");
const accessFresh = path.resolve("packages/db/prisma/current-baseline/migrations", accessName, "migration.sql");
const defaultAclExisting = path.resolve("packages/db/prisma/migrations", defaultAclName, "migration.sql");
const defaultAclFresh = path.resolve("packages/db/prisma/current-baseline/migrations", defaultAclName, "migration.sql");
const schemaPath = path.resolve("packages/db/prisma/schema.prisma");
const databaseProofPath = path.resolve("scripts/test-loi-database.mjs");
const stageConfigPath = path.resolve("prisma.loi-stage.config.ts");
const releaseProofPath = path.resolve(".github/workflows/release-proof.yml");
const [
  migrationBytes,
  baselineMigrationBytes,
  repairBytes,
  baselineRepairBytes,
  accessBytes,
  baselineAccessBytes,
  defaultAclBytes,
  baselineDefaultAclBytes,
  schema,
  databaseProof,
  stageConfig,
  releaseProof,
] = await Promise.all([
  readFile(existing), readFile(fresh), readFile(repairExisting), readFile(repairFresh),
  readFile(accessExisting), readFile(accessFresh), readFile(defaultAclExisting), readFile(defaultAclFresh),
  readFile(schemaPath, "utf8"), readFile(databaseProofPath, "utf8"), readFile(stageConfigPath, "utf8"),
  readFile(releaseProofPath, "utf8"),
]);
const migration = migrationBytes.toString("utf8");
const repair = repairBytes.toString("utf8");
const access = accessBytes.toString("utf8");
const defaultAcl = defaultAclBytes.toString("utf8");

if (!migrationBytes.equals(baselineMigrationBytes)) throw new Error("LOI forward migration differs between existing and fresh roots.");
if (!repairBytes.equals(baselineRepairBytes)) throw new Error("LOI repair migration differs between existing and fresh roots.");
if (!accessBytes.equals(baselineAccessBytes)) throw new Error("Private-helper access migration differs between existing and fresh roots.");
if (!defaultAclBytes.equals(baselineDefaultAclBytes)) throw new Error("Private-helper default ACL migration differs between existing and fresh roots.");
const originalChecksum = createHash("sha256").update(migrationBytes).digest("hex");
if (originalChecksum !== "27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245") {
  throw new Error("The reviewed LOI migration was edited; use a forward repair migration instead.");
}
const repairChecksum = createHash("sha256").update(repairBytes).digest("hex");
if (repairChecksum !== "bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86") {
  throw new Error("The reviewed LOI repair migration was edited; add another forward migration instead.");
}
const accessChecksum = createHash("sha256").update(accessBytes).digest("hex");
if (accessChecksum !== "1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84") {
  throw new Error("The reviewed private-helper access migration was edited; add another forward migration instead.");
}
const defaultAclChecksum = createHash("sha256").update(defaultAclBytes).digest("hex");
if (defaultAclChecksum !== "d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f") {
  throw new Error("The reviewed private-helper default ACL migration was edited; add another forward migration instead.");
}
for (const fragment of [
  'CREATE TABLE public."LoiNegotiation"',
  'CREATE TABLE public."LoiDraft"',
  'CREATE TABLE public."LoiRevision"',
  'CREATE TABLE public."LoiEvent"',
  'CREATE TRIGGER loi_revision_immutable',
  'CREATE TRIGGER loi_event_immutable',
  'LoiNegotiation_buyerUserId_fkey',
  'LoiNegotiation_sellerUserId_fkey',
  'LoiRevision_deadline_check',
  '"computedSummary" ->> \'calculationVersion\' = "calculationVersion"::text',
  'status IN (\'AWAITING_BUYER_SUBMISSION\', \'WITHDRAWN\', \'READ_ONLY\')',
  'LOI draft basis must match its negotiation and sequence.',
  'LOI event revision must belong to its negotiation.',
  'CREATE INDEX "EmailOutbox_loi_delivery_idx"',
  'DEFERRABLE INITIALLY DEFERRED',
  'CREATE TRIGGER loi_event_broadcast',
  "realtime.send(",
  "app_private.can_join_loi_topic",
  'ALTER TABLE public."LoiDraft" ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON TABLE public."LoiNegotiation"',
  'EmailOutbox_loi_binding_check',
  'LoiEvent_negotiationId_clientActionId_key',
]) {
  if (!migration.includes(fragment)) throw new Error(`LOI migration is missing: ${fragment}`);
}
for (const model of ["LoiNegotiation", "LoiDraft", "LoiRevision", "LoiEvent"]) {
  if (!schema.includes(`model ${model} {`)) throw new Error(`Prisma schema is missing ${model}.`);
}
for (const fragment of [
  'ON DELETE RESTRICT ON UPDATE RESTRICT',
  'CONSTRAINT "LoiEvent_shape_check"',
  'type = \'NEGOTIATION_CREATED\'',
  'type = \'EXPIRED\'',
  'type = \'FROZEN\'',
  'status = \'EXPIRED\' AND "closedAt" IS NOT NULL AND "closedReason" = \'RESPONSE_EXPIRED\'',
  'status = \'READ_ONLY\'',
  'LOI event revision must be the current negotiation revision.',
  'Revisionless LOI withdrawal is valid only before initial submission.',
  'Post-submission LOI withdrawal must be performed by the current revision author.',
  'LOI decision actor must be the current revision counterparty.',
  'REVOKE ALL ON FUNCTION app_private.validate_loi_event_actor()',
]) {
  if (!repair.includes(fragment)) throw new Error(`LOI repair migration is missing: ${fragment}`);
}
for (const fragment of [
  "GRANT USAGE ON SCHEMA app_private TO authenticated",
  "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private",
  "app_private.can_join_conversation_topic(text)",
  "app_private.can_join_loi_topic(text)",
  "app_private.can_read_property_image(text, uuid)",
  "app_private.can_upload_session_object(text, text, uuid)",
  "app_private policy dependency contract changed",
  "app_private relations expose a non-owner privilege",
  "postgres default function privileges expose a non-owner grant",
]) {
  if (!access.includes(fragment)) throw new Error(`Private-helper access migration is missing: ${fragment}`);
}
if (/GRANT\s+CREATE\s+ON\s+SCHEMA\s+app_private\s+TO\s+authenticated/i.test(access)
  || /GRANT\s+(?:USAGE|CREATE|ALL)[\s\S]*?ON\s+SCHEMA\s+app_private[\s\S]*?TO\s+(?:PUBLIC|anon|service_role)/i.test(access)) {
  throw new Error("Private-helper access migration exposes unauthorized schema privileges.");
}
for (const fragment of [
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres\n  REVOKE EXECUTE ON FUNCTIONS",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private",
  "default_acl.defaclnamespace IN (0, app_private_oid)",
  "postgres function defaults can expose future app_private helpers",
]) {
  if (!defaultAcl.includes(fragment)) throw new Error(`Private-helper default ACL migration is missing: ${fragment}`);
}
if (!schema.includes('actor          User?               @relation(fields: [actorUserId], references: [id], onDelete: Restrict, onUpdate: Restrict)')) {
  throw new Error("Prisma schema must retain LOI event actors explicitly.");
}
if (databaseProof.includes("--skip-seed")) throw new Error("Prisma 7 migrate reset does not support --skip-seed.");
for (const fragment of [
  "await assertImmediatePreLoiState(before)",
  "await stageUpgradeThroughBase(url)",
  "await assertRetainedBaseState(base)",
  "retainedFixture = await seedRetainedBaseFixture(base)",
  'runPrisma("deploy", "prisma.config.ts", url)',
  'runPrisma("reset", "prisma.baseline.config.ts", url, ["--force"])',
  'LOI_MIGRATION_STAGE_PATH: stageRoot',
  '"27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245"',
  '"bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86"',
  '"1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84"',
  '"d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f"',
  "original_actor_set_null",
  "repair_shape_absent",
  "await removeMigrationStage(stageRoot)",
  "await verifyRetainedBaseFixture(proof, retainedFixture)",
  "await assertFuturePrivateFunctionDefaults(proof)",
  'CREATE FUNCTION app_private.${functionName}()',
  'acldefault(\'f\', procedure.proowner)',
  'row.checksum !== expectedChecksums[row.migration_name]',
]) {
  if (!databaseProof.includes(fragment)) throw new Error(`LOI database proof is missing staged repair evidence: ${fragment}`);
}
for (const fragment of [
  "LOI_MIGRATION_STAGE_PATH",
  "path.isAbsolute(migrationStagePath)",
  "path: migrationStagePath",
]) {
  if (!stageConfig.includes(fragment)) throw new Error(`LOI staged Prisma config is missing: ${fragment}`);
}
const upgradeStep = releaseProof.indexOf("Base-applied LOI forward-repair proof");
const upgradeBehavior = releaseProof.indexOf("Upgrade-target LOI lifecycle and race proof");
const freshStep = releaseProof.indexOf("Exact LOI fresh-chain proof");
if (upgradeStep < 0 || upgradeBehavior <= upgradeStep || freshStep <= upgradeBehavior
  || !releaseProof.includes("run: npm run db:test-loi:upgrade")) {
  throw new Error("Protected release proof must run staged LOI repair, upgrade behavior, then fresh proof in order.");
}
if (/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)[\s\S]*public\."Loi/i.test(migration)) throw new Error("LOI tables expose raw browser CRUD.");
if (/CREATE POLICY[\s\S]*ON realtime\.messages[\s\S]*FOR INSERT/i.test(migration)) throw new Error("LOI migration grants browser Realtime send access.");
for (const sql of [migration, repair, access, defaultAcl]) {
  for (const match of sql.matchAll(/(?:CONSTRAINT|INDEX|TRIGGER)\s+"([^"]+)"/g)) {
    if (Buffer.byteLength(match[1], "utf8") > 63) throw new Error(`PostgreSQL identifier exceeds 63 bytes: ${match[1]}`);
  }
}
if (!migration.trimStart().startsWith("BEGIN;") || !migration.trimEnd().endsWith("COMMIT;")) throw new Error("LOI migration must be one transaction.");
if (!repair.trimStart().startsWith("BEGIN;") || !repair.trimEnd().endsWith("COMMIT;")) throw new Error("LOI repair migration must be one transaction.");
if (!access.trimStart().startsWith("--") || !access.includes("\nBEGIN;") || !access.trimEnd().endsWith("COMMIT;")) throw new Error("Private-helper access migration must be one transaction.");
if (!defaultAcl.trimStart().startsWith("--") || !defaultAcl.includes("\nBEGIN;") || !defaultAcl.trimEnd().endsWith("COMMIT;")) throw new Error("Private-helper default ACL migration must be one transaction.");
process.stdout.write(`${JSON.stringify({
  migration: name,
  repairMigration: repairName,
  accessMigration: accessName,
  defaultAclMigration: defaultAclName,
  status: "passed",
  tables: 4,
  realtime: "identifier-only",
}, null, 2)}\n`);
