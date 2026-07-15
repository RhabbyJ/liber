import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const checkOnly = process.argv.includes("--check");
if (process.argv.length > (checkOnly ? 3 : 2)) {
  throw new Error("Usage: node scripts/generate-current-baseline.mjs [--check]");
}

const sourceRoot = path.resolve("packages/db/prisma/migrations");
const baselineRoot = path.resolve("packages/db/prisma/current-baseline/migrations");
const baselineName = "20260714190000_current_supported_baseline";
const baselineCutoff = "20260714150654_add_guided_messaging_v1";
const lockedSnapshotSourceDigest = "0bb97bd74c6a0165df2958e1f46db77580b27306de1764e179d7f1b10695651e";
const outputPath = path.join(baselineRoot, baselineName, "migration.sql");
const incompatibleMigration = "20260521000005_audit_hardening";
const omittedStatements = [
  "ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;",
  "REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;",
];
const enumCommitBoundaryMigrations = new Set([
  "20260708000012_add_property_subtypes_and_ownership_evidence",
  "20260709000014_add_search_rollup_relation_type",
  "20260711082500_close_property_identity_lifecycle",
]);

const directories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (directories.length === 0) throw new Error("No Prisma migrations were found.");

const sourceMigrations = await Promise.all(directories.map(async (migrationName) => {
  const sourcePath = path.join(sourceRoot, migrationName, "migration.sql");
  const original = normalize(await readFile(sourcePath, "utf8"));
  return { checksum: sha256(original), migrationName, original };
}));
const snapshotSources = sourceMigrations.filter(({ migrationName }) => migrationName <= baselineCutoff);
const forwardSources = sourceMigrations.filter(({ migrationName }) => migrationName > baselineCutoff);
const snapshotSourceDigest = sha256(JSON.stringify(
  snapshotSources.map(({ checksum, migrationName }) => [migrationName, checksum]),
));
if (snapshotSourceDigest !== lockedSnapshotSourceDigest) {
  throw new Error("A source migration inside the locked current baseline changed. Restore immutable history; do not regenerate it.");
}
if (snapshotSources.at(-1)?.migrationName !== baselineCutoff) {
  throw new Error(`The locked baseline cutoff ${baselineCutoff} is missing.`);
}

const sections = [];
let externalPolicyCount = 0;
for (const { checksum, migrationName, original } of snapshotSources) {
  let body = original;

  if (migrationName === incompatibleMigration) {
    for (const statement of omittedStatements) {
      if (count(body, statement) !== 1) {
        throw new Error(`${migrationName} must contain exactly one reviewed obsolete statement: ${statement}`);
      }
      body = body.replace(`${statement}\n`, "");
    }
  } else if (omittedStatements.some((statement) => body.includes(statement))) {
    throw new Error(`An obsolete PostGIS ownership statement moved to ${migrationName}; review the baseline generator.`);
  }

  if (enumCommitBoundaryMigrations.has(migrationName)) {
    const enumBlockPattern = /(?:ALTER TYPE[^\n]+ ADD VALUE[^\n]+;\n)+/;
    const matches = body.match(new RegExp(enumBlockPattern.source, "g")) ?? [];
    if (matches.length !== 1) {
      throw new Error(`${migrationName} must contain exactly one reviewed enum-addition block.`);
    }
    body = body.replace(enumBlockPattern, `BEGIN;\n${matches[0]}COMMIT;\n`);
  }

  const externalPolicyPattern = /CREATE POLICY ("[^"]+")\nON (storage\.objects|realtime\.messages)/g;
  externalPolicyCount += [...body.matchAll(externalPolicyPattern)].length;
  body = body.replace(
    externalPolicyPattern,
    "DROP POLICY IF EXISTS $1 ON $2;\nCREATE POLICY $1\nON $2",
  );

  sections.push({
    body: body.trimEnd(),
    checksum,
    migrationName,
  });
}
if (externalPolicyCount !== 18) {
  throw new Error(`The locked baseline must reconcile exactly 18 external-schema policies; found ${externalPolicyCount}.`);
}

const header = [
  "-- GENERATED FILE. Run `npm run db:baseline:generate`; do not edit directly.",
  "-- Supported only for a brand-new Liber schema on a current Supabase project.",
  "-- Existing databases must continue to use packages/db/prisma/migrations.",
  `-- Locked source cutoff: ${baselineCutoff}. Later migrations remain separate forward files.`,
  "-- Enum additions gain explicit commit boundaries required by the consolidated query; schema semantics are unchanged.",
  "-- Liber Storage/Realtime policy names are dropped before recreation because Prisma reset does not drop platform schemas.",
  "-- The source ledger and SHA-256 checksums follow.",
  ...sections.map(({ checksum, migrationName }) => `-- ${migrationName} ${checksum}`),
  "",
  "-- Fail closed if this fresh-only path is pointed at an existing Liber database.",
  "DO $$",
  "BEGIN",
  "  IF to_regclass('public.\"User\"') IS NOT NULL",
  "    OR to_regclass('public.\"Invite\"') IS NOT NULL",
  "    OR to_regclass('public.markets') IS NOT NULL THEN",
  "    RAISE EXCEPTION 'The current Liber baseline may run only on a brand-new application schema.';",
  "  END IF;",
  "END",
  "$$;",
].join("\n");

const artifact = `${header}\n\n${sections.map(({ body, checksum, migrationName }) => [
  `-- BEGIN SOURCE ${migrationName} (${checksum})`,
  body,
  `-- END SOURCE ${migrationName}`,
].join("\n")).join("\n\n")}\n`;

if (checkOnly) {
  const committed = normalize(await readFile(outputPath, "utf8").catch(() => ""));
  if (committed !== artifact) {
    throw new Error("The committed current baseline is stale. Run `npm run db:baseline:generate`.");
  }
  await assertForwardArtifacts();
  process.stdout.write(`${baselineName} matches ${sections.length} locked sources and ${forwardSources.length} forward migrations (${sha256(artifact)}).\n`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, artifact, "utf8");
  for (const { migrationName, original } of forwardSources) {
    const forwardPath = path.join(baselineRoot, migrationName, "migration.sql");
    await mkdir(path.dirname(forwardPath), { recursive: true });
    await writeFile(forwardPath, original, "utf8");
  }
  await assertForwardArtifacts();
  process.stdout.write(`Generated ${path.relative(process.cwd(), outputPath)} from ${sections.length} locked sources plus ${forwardSources.length} forward migrations (${sha256(artifact)}).\n`);
}

async function assertForwardArtifacts() {
  const expectedDirectories = [baselineName, ...forwardSources.map(({ migrationName }) => migrationName)].sort();
  const actualDirectories = (await readdir(baselineRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actualDirectories) !== JSON.stringify(expectedDirectories)) {
    throw new Error(`Current-baseline migration directories differ from the expected locked baseline plus forwards: ${JSON.stringify(actualDirectories)}`);
  }
  for (const { migrationName, original } of forwardSources) {
    const committed = normalize(await readFile(path.join(baselineRoot, migrationName, "migration.sql"), "utf8").catch(() => ""));
    if (committed !== original) {
      throw new Error(`Current-baseline forward migration ${migrationName} differs from immutable migration history.`);
    }
  }
}

function normalize(value) {
  return value.replace(/\r\n/g, "\n");
}

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
