import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const name = "20260716030741_add_loi_negotiations";
const repairName = "20260716120000_harden_loi_event_semantics";
const existing = path.resolve("packages/db/prisma/migrations", name, "migration.sql");
const fresh = path.resolve("packages/db/prisma/current-baseline/migrations", name, "migration.sql");
const repairExisting = path.resolve("packages/db/prisma/migrations", repairName, "migration.sql");
const repairFresh = path.resolve("packages/db/prisma/current-baseline/migrations", repairName, "migration.sql");
const schemaPath = path.resolve("packages/db/prisma/schema.prisma");
const databaseProofPath = path.resolve("scripts/test-loi-database.mjs");
const stageConfigPath = path.resolve("prisma.loi-stage.config.ts");
const releaseProofPath = path.resolve(".github/workflows/release-proof.yml");
const [migrationBytes, baselineMigrationBytes, repairBytes, baselineRepairBytes, schema, databaseProof, stageConfig, releaseProof] = await Promise.all([
  readFile(existing), readFile(fresh), readFile(repairExisting), readFile(repairFresh), readFile(schemaPath, "utf8"),
  readFile(databaseProofPath, "utf8"), readFile(stageConfigPath, "utf8"), readFile(releaseProofPath, "utf8"),
]);
const migration = migrationBytes.toString("utf8");
const repair = repairBytes.toString("utf8");

if (!migrationBytes.equals(baselineMigrationBytes)) throw new Error("LOI forward migration differs between existing and fresh roots.");
if (!repairBytes.equals(baselineRepairBytes)) throw new Error("LOI repair migration differs between existing and fresh roots.");
const originalChecksum = createHash("sha256").update(migrationBytes).digest("hex");
if (originalChecksum !== "27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245") {
  throw new Error("The reviewed LOI migration was edited; use a forward repair migration instead.");
}
const repairChecksum = createHash("sha256").update(repairBytes).digest("hex");
if (repairChecksum !== "bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86") {
  throw new Error("The reviewed LOI repair migration was edited; add another forward migration instead.");
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
  "original_actor_set_null",
  "repair_shape_absent",
  "await removeMigrationStage(stageRoot)",
  "await verifyRetainedBaseFixture(proof, retainedFixture)",
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
for (const sql of [migration, repair]) {
  for (const match of sql.matchAll(/(?:CONSTRAINT|INDEX|TRIGGER)\s+"([^"]+)"/g)) {
    if (Buffer.byteLength(match[1], "utf8") > 63) throw new Error(`PostgreSQL identifier exceeds 63 bytes: ${match[1]}`);
  }
}
if (!migration.trimStart().startsWith("BEGIN;") || !migration.trimEnd().endsWith("COMMIT;")) throw new Error("LOI migration must be one transaction.");
if (!repair.trimStart().startsWith("BEGIN;") || !repair.trimEnd().endsWith("COMMIT;")) throw new Error("LOI repair migration must be one transaction.");
process.stdout.write(`${JSON.stringify({ migration: name, repairMigration: repairName, status: "passed", tables: 4, realtime: "identifier-only" }, null, 2)}\n`);
