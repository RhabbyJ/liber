import { readFile } from "node:fs/promises";
import pg from "pg";

const envFile = await loadEnvFile(".env");
const env = { ...envFile, ...process.env };
const productionMode = process.argv.includes("--production");

const required = [
  ["DATABASE_URL", "Prisma runtime database connection"],
  ["DIRECT_URL", "Prisma migration database connection"],
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Browser-safe Supabase publishable key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Server-only Supabase admin/storage operations"],
];

const productionChecks = [
  ["CRON_SECRET", "Maintenance route bearer secret"],
  ["NEXT_PUBLIC_MAPBOX_TOKEN", "Mapbox autocomplete/geocoding and production map rendering"],
  ["ATTOM_API_KEY", "ATTOM property facts enrichment"],
  ["ATTOM_BASE_URL", "ATTOM API base URL"],
  ["RESEND_API_KEY", "Resend transactional invite email"],
  ["RESEND_FROM_EMAIL", "Verified Resend sender address/domain"],
];

const optional = [
  ["NODE_EXTRA_CA_CERTS", "Local Node CA trust override for Supabase TLS issues"],
];

const failures = [];
const warnings = [];

console.log("Liber readiness check");
console.log("---------------------");

for (const [name, description] of required) {
  report(name, description, "required", failures);
}

for (const [name, description] of productionChecks) {
  report(name, description, productionMode ? "required" : "production", productionMode ? failures : warnings);
}

for (const [name, description] of optional) {
  report(name, description, "optional", warnings);
}

checkUrl("NEXT_PUBLIC_SUPABASE_URL", failures);
checkUrl("ATTOM_BASE_URL", productionMode ? failures : warnings);
checkPostgresUrl("DATABASE_URL", failures);
checkPostgresUrl("DIRECT_URL", failures);
checkEmailPair(warnings, failures);
checkAutoConfirm(failures);

if (productionMode && failures.length === 0) {
  await checkProductionDependencies(failures);
}

console.log("");
console.log("Production deployment prerequisites outside env:");
console.log("- See docs/product/production-decisions.md for migration proof, production admin assignment, provider setup, malware-scanner credentials, and Supabase advisor remediation.");

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length > 0) {
  console.log("");
  console.log("Failures:");
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}

console.log("");
console.log(productionMode ? "production readiness env passed" : "local readiness env passed");

async function loadEnvFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = {};

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      parsed[key] = unquote(value);
    }

    return parsed;
  } catch {
    return {};
  }
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function hasValue(name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function report(name, description, mode, collection) {
  const ok = hasValue(name);
  const label = ok ? "ok" : mode === "required" ? "missing" : "not configured";
  console.log(`${label.padEnd(14)} ${name.padEnd(36)} ${description}`);

  if (!ok && mode === "required") collection.push(`${name} is required: ${description}.`);
  if (!ok && mode === "production") collection.push(`${name} is needed for production: ${description}.`);
}

function checkUrl(name, collection) {
  if (!hasValue(name)) return;

  try {
    const url = new URL(env[name]);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      collection.push(`${name} should use https outside local development.`);
    }
  } catch {
    collection.push(`${name} is not a valid URL.`);
  }
}

function checkPostgresUrl(name, collection) {
  if (!hasValue(name)) return;

  try {
    const url = new URL(env[name]);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      collection.push(`${name} must be a postgres/postgresql URL.`);
    }
  } catch {
    collection.push(`${name} is not a valid Postgres URL.`);
  }
}

function checkEmailPair(warningsCollection, failuresCollection) {
  const hasKey = hasValue("RESEND_API_KEY");
  const hasFrom = hasValue("RESEND_FROM_EMAIL");
  const collection = productionMode ? failuresCollection : warningsCollection;

  if (hasKey !== hasFrom) {
    collection.push("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured together for live invite email.");
  }
}

function checkAutoConfirm(collection) {
  if (productionMode && env.LIBER_AUTO_CONFIRM_SIGNUPS === "true") {
    collection.push("LIBER_AUTO_CONFIRM_SIGNUPS must be unset or false in production.");
  }
}

async function checkProductionDependencies(collection) {
  const client = new pg.Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const migration = await client.query(`
      SELECT migration_name
      FROM public._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `);
    const expectedHead = "20260711082500_close_property_identity_lifecycle";
    if (migration.rows[0]?.migration_name !== expectedHead) {
      collection.push(`Database migration head must be ${expectedHead}.`);
    }
    const geography = await client.query(`
      SELECT
        (SELECT count(*) FROM public.markets WHERE active = true) AS markets,
        (SELECT count(*) FROM public.service_areas area JOIN public.markets market ON market.id = area.market_id WHERE area.active = true AND market.active = true) AS areas
    `);
    if (Number(geography.rows[0]?.markets ?? 0) < 1 || Number(geography.rows[0]?.areas ?? 0) < 1) {
      collection.push("At least one active market and active canonical service area are required.");
    }
    const buckets = await client.query(`
      SELECT id, public FROM storage.buckets
      WHERE id IN ('property-images', 'verification-documents')
    `);
    const bucketMap = new Map(buckets.rows.map((row) => [row.id, row.public]));
    if (bucketMap.get("property-images") !== false || bucketMap.get("verification-documents") !== false) {
      collection.push("Property image and verification document buckets must exist and be private.");
    }
    const policies = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
    `);
    const policyNames = new Set(policies.rows.map((row) => row.policyname));
    for (const requiredPolicy of [
      "Authorized users can read private property images",
      "Active users can upload authorized session objects",
    ]) {
      if (!policyNames.has(requiredPolicy)) collection.push(`Missing critical Storage policy: ${requiredPolicy}.`);
    }
    const heartbeat = await client.query(`
      SELECT "lastRunAt" FROM public."WorkerHeartbeat" WHERE worker = 'email-outbox'
    `);
    const lastRunAt = heartbeat.rows[0]?.lastRunAt ? new Date(heartbeat.rows[0].lastRunAt).getTime() : 0;
    if (!lastRunAt || Date.now() - lastRunAt > 5 * 60_000) {
      collection.push("Email outbox worker heartbeat must be less than five minutes old.");
    }
  } catch (error) {
    collection.push(`Production dependency check failed: ${error instanceof Error ? error.message : "unknown database error"}.`);
  } finally {
    await client.end().catch(() => {});
  }
}
