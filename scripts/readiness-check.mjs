import { readFile } from "node:fs/promises";
import pg from "pg";

import {
  assessMigrationReadiness,
  assessSharedRateLimiter,
  assessWorkerHeartbeats,
  maintenanceWorkerHeartbeats,
  readLocalMigrations,
  readReviewedRetainedMigrationChecksums,
  reviewedRetainedProjectRef,
  sharedRateLimiterCatalogQuery,
  workerHeartbeatQuery,
} from "./migration-readiness.mjs";

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
  ["AUTH_RATE_LIMIT_PEPPER", "HMAC secret for shared Auth rate-limit identifiers"],
  ["CRON_SECRET", "Maintenance route bearer secret"],
  ["NEXT_PUBLIC_MAPBOX_TOKEN", "Mapbox autocomplete/geocoding and production map rendering"],
  ["ATTOM_API_KEY", "ATTOM property facts enrichment"],
  ["ATTOM_BASE_URL", "ATTOM API base URL"],
  ["RESEND_API_KEY", "Resend transactional invite email"],
  ["RESEND_FROM_EMAIL", "Verified Resend sender address/domain"],
  ["SITE_URL", "Canonical HTTPS origin for authenticated email links"],
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
checkCanonicalSiteUrl(productionMode ? failures : warnings);
checkPostgresUrl("DATABASE_URL", failures);
checkPostgresUrl("DIRECT_URL", failures);
checkEmailPair(warnings, failures);
checkAutoConfirm(failures);
checkPreviewSellerSelfApproval(failures);
checkRateLimitPepper(productionMode ? failures : warnings);
checkMinimumSecret("CRON_SECRET", 32, productionMode ? failures : warnings);
checkSupabaseKeyClasses(failures);
checkMessagingRollout(productionMode ? failures : warnings);
checkLoiRollout(productionMode ? failures : warnings);

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

function checkPreviewSellerSelfApproval(collection) {
  const value = env.LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL?.trim();
  if (value && value !== "true" && value !== "false") {
    collection.push("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL must equal true or false when configured.");
    return;
  }
  if (value !== "true") return;

  if (env.LIBER_CEO_PREVIEW_TARGET !== "ceo-preview") {
    collection.push("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL requires LIBER_CEO_PREVIEW_TARGET=ceo-preview.");
  }
  if (productionMode) {
    collection.push("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL must be unset or false for true production readiness.");
  }
}

function checkCanonicalSiteUrl(collection) {
  if (!hasValue("SITE_URL")) return;

  try {
    const url = new URL(env.SITE_URL);
    const localHttp = !productionMode
      && url.protocol === "http:"
      && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      collection.push("SITE_URL must use https in production.");
    }
    if (url.username || url.password) {
      collection.push("SITE_URL must not contain credentials.");
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      collection.push("SITE_URL must be an origin without a path, query, or fragment.");
    }
  } catch {
    collection.push("SITE_URL is not a valid URL.");
  }
}

function checkRateLimitPepper(collection) {
  if (!hasValue("AUTH_RATE_LIMIT_PEPPER")) return;
  if (env.AUTH_RATE_LIMIT_PEPPER.trim().length < 32) {
    collection.push("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters.");
  }
}

function checkMinimumSecret(name, minimumLength, collection) {
  if (!hasValue(name)) return;
  if (env[name].trim().length < minimumLength) {
    collection.push(`${name} must contain at least ${minimumLength} characters.`);
  }
}

function checkSupabaseKeyClasses(collection) {
  if (hasValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
    const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
    if (!publishableKey.startsWith("sb_publishable_") && jwtRole(publishableKey) !== "anon") {
      collection.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key or a legacy anon-role JWT.");
    }
  }

  if (hasValue("SUPABASE_SERVICE_ROLE_KEY")) {
    const serverKey = env.SUPABASE_SERVICE_ROLE_KEY.trim();
    if (!serverKey.startsWith("sb_secret_") && jwtRole(serverKey) !== "service_role") {
      collection.push("SUPABASE_SERVICE_ROLE_KEY must be a secret key or a legacy service-role JWT.");
    }
  }
}

function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function checkMessagingRollout(collection) {
  if (env.LIBER_MESSAGING_V1_ENABLED?.trim().toLowerCase() !== "true") return;

  const cohort = env.LIBER_MESSAGING_V1_COHORT_USER_IDS?.trim();
  if (!cohort) {
    collection.push("LIBER_MESSAGING_V1_COHORT_USER_IDS is required when Guided Messaging V1 is enabled.");
    return;
  }

  const members = cohort.split(",").map((value) => value.trim()).filter(Boolean);
  if (members.length === 0) {
    collection.push("LIBER_MESSAGING_V1_COHORT_USER_IDS must include at least one reviewed UUID.");
    return;
  }
  if (productionMode && members.includes("*")) {
    collection.push("Guided Messaging V1 production rollout must use an explicit reviewed UUID cohort, not '*'.");
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (members.some((member) => member !== "*" && !uuid.test(member))) {
    collection.push("LIBER_MESSAGING_V1_COHORT_USER_IDS must contain only UUIDs separated by commas.");
  }
}

function checkLoiRollout(collection) {
  if (env.LIBER_LOI_V1_ENABLED?.trim().toLowerCase() !== "true") return;

  const cohort = env.LIBER_LOI_V1_COHORT_USER_IDS?.trim();
  if (!cohort) {
    collection.push("LIBER_LOI_V1_COHORT_USER_IDS is required when LOI V1 is enabled.");
    return;
  }
  if (cohort === "*") {
    if (productionMode) {
      collection.push("LOI V1 production rollout must use exactly two explicit reviewed participant UUIDs, not '*'.");
    }
    return;
  }
  const members = cohort.split(",").map((value) => value.trim());
  if (members.length !== 2
    || members.some((member) => !member)
    || new Set(members.map((member) => member.toLowerCase())).size !== 2) {
    collection.push("LIBER_LOI_V1_COHORT_USER_IDS must contain exactly two unique reviewed participant UUIDs.");
    return;
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (members.some((member) => !uuid.test(member))) {
    collection.push("LOI V1 rollout must use only explicit reviewed UUIDs, never wildcards or aliases.");
  }
}

async function checkProductionDependencies(collection) {
  const client = new pg.Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const localMigrations = await readLocalMigrations(
      new URL("../packages/db/prisma/migrations/", import.meta.url),
    );
    const localChecksums = new Map(localMigrations.map((migration) => [
      migration.migrationName,
      migration.checksum,
    ]));
    const retainedProjectRef = reviewedRetainedProjectRef(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.DIRECT_URL,
    );
    const retainedChecksums = await readReviewedRetainedMigrationChecksums({
      migrationsDirectory: new URL("../packages/db/prisma/migrations/", import.meta.url),
      projectRef: retainedProjectRef,
    });
    for (const [migrationName, reviewedChecksums] of retainedChecksums) {
      localChecksums.set(
        migrationName,
        new Set([localChecksums.get(migrationName), ...reviewedChecksums]),
      );
    }
    const migrations = await client.query(`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM public._prisma_migrations
      ORDER BY migration_name, started_at
    `);
    const migrationReadiness = assessMigrationReadiness(
      localMigrations.map((migration) => migration.migrationName),
      migrations.rows,
      localChecksums,
    );
    const acceptedRetainedLineage = migrations.rows
      .filter((migration) => migration.finished_at != null && migration.rolled_back_at == null)
      .filter((migration) => retainedChecksums.get(migration.migration_name)?.has(migration.checksum))
      .map((migration) => migration.migration_name)
      .sort();
    if (acceptedRetainedLineage.length > 0) {
      console.log(`Reviewed retained migration lineage accepted for ${retainedProjectRef}: ${acceptedRetainedLineage.join(", ")}.`);
    }
    if (migrationReadiness.missing.length > 0) {
      collection.push(`Local migrations missing from the database: ${migrationReadiness.missing.join(", ")}.`);
    }
    if (migrationReadiness.failed.length > 0) {
      collection.push(`Local migrations failed in the database: ${migrationReadiness.failed.join(", ")}.`);
    }
    if (migrationReadiness.rolledBack.length > 0) {
      collection.push(`Local migrations rolled back in the database: ${migrationReadiness.rolledBack.join(", ")}.`);
    }
    if (migrationReadiness.checksumDrift.length > 0) {
      collection.push(`Applied migration checksums differ from local SQL: ${migrationReadiness.checksumDrift.join(", ")}.`);
    }
    if (migrationReadiness.databaseOnly.length > 0) {
      collection.push(
        `Database-only migrations are not present locally: ${migrationReadiness.databaseOnly.join(", ")}.`,
      );
    }
    const previewSellerApprovals = await client.query(`
      SELECT count(*)::int AS count
      FROM public."SellerAccess" access
      WHERE access.status = 'APPROVED'
        AND access."reviewedByUserId" IS NULL
        AND access."reviewedAt" IS NULL
        AND EXISTS (
          SELECT 1
          FROM public."AdminAuditLog" audit
          WHERE audit.action = 'seller_access_preview_self_approval'
            AND audit."targetType" = 'user'
            AND audit."targetId" = access."userId"::text
        )
    `);
    const previewSellerApprovalCount = Number(previewSellerApprovals.rows[0]?.count ?? 0);
    if (previewSellerApprovalCount > 0) {
      collection.push(
        `${previewSellerApprovalCount} seller access record(s) still rely on private-preview self-approval; complete a real admin review before production.`,
      );
    }
    const previewAdminGrants = await client.query(`
      SELECT count(*)::int AS count
      FROM public."User" app_user
      WHERE 'ADMIN'::public."UserRole" = ANY(app_user.roles)
        AND EXISTS (
          SELECT 1
          FROM public."AdminAuditLog" audit
          WHERE audit.action = 'admin_role_preview_self_grant'
            AND audit."targetType" = 'user'
            AND audit."targetId" = app_user.id::text
        )
    `);
    const previewAdminGrantCount = Number(previewAdminGrants.rows[0]?.count ?? 0);
    if (previewAdminGrantCount > 0) {
      collection.push(
        `${previewAdminGrantCount} user(s) still rely on private-preview admin self-grant; remove ADMIN or replace the preview marker before production.`,
      );
    }
    const testPropertyApprovals = await client.query(`
      SELECT count(*)::int AS count
      FROM public."SellerProperty" property
      JOIN LATERAL (
        SELECT audit.action
        FROM public."AdminAuditLog" audit
        WHERE audit."targetType" = 'seller_property'
          AND audit."targetId" = property.id
          AND audit.metadata->>'propertyIdentityVersion' = property."identityVersion"::text
          AND audit.action IN ('property_synthetic_test_approval', 'property_synthetic_test_revocation')
        ORDER BY audit."createdAt" DESC, audit.id DESC
        LIMIT 1
      ) latest_test_review ON true
      WHERE property."ownershipVerificationStatus" = 'APPROVED'
        AND latest_test_review.action = 'property_synthetic_test_approval'
    `);
    const testPropertyApprovalCount = Number(testPropertyApprovals.rows[0]?.count ?? 0);
    if (testPropertyApprovalCount > 0) {
      collection.push(
        `${testPropertyApprovalCount} property record(s) still rely on synthetic test approval; revoke test approval or complete real evidence review before public launch.`,
      );
    }
    const geography = await client.query(`
      SELECT
        (SELECT count(*) FROM public.markets WHERE active = true) AS markets,
        (SELECT count(*) FROM public.service_areas area JOIN public.markets market ON market.id = area.market_id WHERE area.active = true AND market.active = true) AS areas
    `);
    if (Number(geography.rows[0]?.markets ?? 0) < 1 || Number(geography.rows[0]?.areas ?? 0) < 1) {
      collection.push("At least one active market and active canonical service area are required.");
    }
    const sharedRateLimiter = await client.query(sharedRateLimiterCatalogQuery);
    collection.push(...assessSharedRateLimiter(sharedRateLimiter.rows[0]));
    const buckets = await client.query(`
      SELECT id, public FROM storage.buckets
      WHERE id IN ('property-images', 'verification-documents')
    `);
    const bucketMap = new Map(buckets.rows.map((row) => [row.id, row.public]));
    if (bucketMap.get("property-images") !== false || bucketMap.get("verification-documents") !== false) {
      collection.push("Property image and verification document buckets must exist and be private.");
    }
    const policies = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN (
          'Authorized users can read private property images',
          'Active users can upload authorized session objects'
        )
    `);
    const policyByName = new Map(policies.rows.map((row) => [row.policyname, row]));
    const propertyRead = policyByName.get("Authorized users can read private property images");
    if (!validStoragePolicy(propertyRead, {
      command: "SELECT",
      expressionField: "qual",
      fragments: ["'property-images'", "app_private.can_read_property_image"],
    })) {
      collection.push("Critical Storage property-image read policy is missing or has an unexpected definition.");
    }
    const sessionUpload = policyByName.get("Active users can upload authorized session objects");
    if (!validStoragePolicy(sessionUpload, {
      command: "INSERT",
      expressionField: "with_check",
      fragments: ["'property-images'", "'verification-documents'", "app_private.can_upload_session_object"],
    })) {
      collection.push("Critical Storage upload policy is missing or has an unexpected definition.");
    }
    const heartbeats = await client.query(workerHeartbeatQuery, [
      maintenanceWorkerHeartbeats.map(([worker]) => worker),
    ]);
    collection.push(...assessWorkerHeartbeats(heartbeats.rows));
  } catch (error) {
    collection.push(`Production dependency check failed: ${error instanceof Error ? error.message : "unknown database error"}.`);
  } finally {
    await client.end().catch(() => {});
  }
}

function validStoragePolicy(policy, expected) {
  const roles = Array.isArray(policy?.roles)
    ? policy.roles
    : typeof policy?.roles === "string"
      ? policy.roles.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
      : [];
  if (
    !policy
    || policy.permissive !== "PERMISSIVE"
    || policy.cmd !== expected.command
    || roles.length !== 1
    || roles[0] !== "authenticated"
  ) return false;
  const expression = policy[expected.expressionField];
  return typeof expression === "string"
    && expected.fragments.every((fragment) => expression.includes(fragment));
}
