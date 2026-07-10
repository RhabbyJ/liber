import { readFile } from "node:fs/promises";

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
  ["AUTH_RATE_LIMIT_PEPPER", "32+ character HMAC pepper for shared limiter keys"],
  ["CRON_SECRET", "Maintenance route bearer secret"],
  ["NEXT_PUBLIC_MAPBOX_TOKEN", "Mapbox autocomplete/geocoding and production map rendering"],
  ["ATTOM_API_KEY", "ATTOM property facts enrichment"],
  ["ATTOM_BASE_URL", "ATTOM API base URL"],
  ["RESEND_API_KEY", "Resend transactional invite email"],
  ["RESEND_FROM_EMAIL", "Verified Resend sender address/domain"],
];

const optional = [
  ["SENTRY_DSN", "Error reporting"],
  ["POSTHOG_KEY", "Product analytics"],
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
checkAuthRateLimitPepper(productionMode ? failures : warnings);

console.log("");
console.log("Production decisions still required outside env:");
console.log("- See docs/product/production-decisions.md for launch market, invite limits, ownership/badge evidence, verification wording, production admin assignment, email provider, Mapbox/geocoding, and Supabase advisor remediation.");

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

function checkAuthRateLimitPepper(collection) {
  if (!hasValue("AUTH_RATE_LIMIT_PEPPER")) return;
  if (env.AUTH_RATE_LIMIT_PEPPER.length < 32) {
    collection.push("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters.");
  }
}
