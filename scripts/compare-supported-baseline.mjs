import "dotenv/config";
import { createHash } from "node:crypto";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const upgradeUrl = process.env.BASELINE_COMPARE_UPGRADE_DATABASE_URL;
const freshUrl = process.env.BASELINE_COMPARE_FRESH_DATABASE_URL;
const upgradeSentinel = process.env.BASELINE_COMPARE_UPGRADE_SENTINEL;
const freshSentinel = process.env.BASELINE_COMPARE_FRESH_SENTINEL;

async function assertTargets() {
  const missing = [
    !upgradeUrl && "BASELINE_COMPARE_UPGRADE_DATABASE_URL",
    !freshUrl && "BASELINE_COMPARE_FRESH_DATABASE_URL",
    (!upgradeSentinel || upgradeSentinel.length < 16) && "BASELINE_COMPARE_UPGRADE_SENTINEL (16+ characters)",
    (!freshSentinel || freshSentinel.length < 16) && "BASELINE_COMPARE_FRESH_SENTINEL (16+ characters)",
    process.env.BASELINE_COMPARE_ALLOW_READS !== "true" && "BASELINE_COMPARE_ALLOW_READS=true",
    !process.env.DIRECT_URL && "DIRECT_URL shared-target deny URL",
    !process.env.DATABASE_URL && "DATABASE_URL shared-target deny URL",
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`Baseline comparison not run: missing ${missing.join(", ")}.`);
  if (sameDatabaseTarget(upgradeUrl, freshUrl)) {
    throw new Error("Baseline comparison requires two different disposable databases.");
  }
  for (const candidate of [upgradeUrl, freshUrl]) {
    for (const shared of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
      if (sameDatabaseTarget(candidate, shared)) {
        throw new Error("Refusing to compare against the configured shared database.");
      }
    }
  }
}

async function capture(url, sentinel, label) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const guard = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM public.messaging_migration_test_sentinel WHERE token = $1
      ) AS verified
    `, [sentinel]).catch((error) => {
      if (error?.code === "42P01") return { rows: [{ verified: false }] };
      throw error;
    });
    if (!guard.rows[0]?.verified) throw new Error(`${label} disposable sentinel is missing or invalid.`);

    const metadataResult = await client.query(`
      SELECT
        current_setting('server_version_num') AS server_version_num,
        (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis_version,
        (SELECT count(*)::int FROM public._prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied_migrations
    `);
    const rows = await client.query(catalogSql);
    const privileges = await client.query(privilegeSql);
    return { metadata: metadataResult.rows[0], privileges: privileges.rows, rows: rows.rows };
  } finally {
    await client.end();
  }
}

const catalogSql = `
WITH app_relations AS (
  SELECT class.oid, namespace.nspname AS schema_name, class.relname
  FROM pg_class class
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  LEFT JOIN pg_depend extension_dependency
    ON extension_dependency.classid = 'pg_class'::regclass
   AND extension_dependency.objid = class.oid
   AND extension_dependency.deptype = 'e'
  WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')
    AND class.relname NOT IN ('_prisma_migrations', 'messaging_migration_test_sentinel')
    AND extension_dependency.objid IS NULL
), catalog AS (
  SELECT 'relation'::text AS category,
         relation.schema_name || '.' || relation.relname AS identity,
         concat_ws('|', class.relkind, class.relpersistence, class.relrowsecurity,
           class.relforcerowsecurity) AS definition
  FROM app_relations relation JOIN pg_class class ON class.oid = relation.oid

  UNION ALL
  SELECT 'column', relation.schema_name || '.' || relation.relname || '.' || attribute.attname,
         concat_ws('|', attribute.attnum, format_type(attribute.atttypid, attribute.atttypmod),
           attribute.attnotnull, attribute.attidentity, attribute.attgenerated,
           coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), ''))
  FROM app_relations relation
  JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
  LEFT JOIN pg_attrdef default_value
    ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped

  UNION ALL
  SELECT 'constraint', relation.schema_name || '.' || relation.relname || '.' || constraint_value.conname,
         concat_ws('|', constraint_value.contype, constraint_value.condeferrable,
           constraint_value.condeferred, constraint_value.convalidated,
           pg_get_constraintdef(constraint_value.oid, true))
  FROM app_relations relation
  JOIN pg_constraint constraint_value ON constraint_value.conrelid = relation.oid

  UNION ALL
  SELECT 'index', relation.schema_name || '.' || relation.relname || '.' || index_class.relname,
         pg_get_indexdef(index_value.indexrelid)
  FROM app_relations relation
  JOIN pg_index index_value ON index_value.indrelid = relation.oid
  JOIN pg_class index_class ON index_class.oid = index_value.indexrelid

  UNION ALL
  SELECT 'trigger', namespace.nspname || '.' || class.relname || '.' || trigger_value.tgname,
         pg_get_triggerdef(trigger_value.oid, true)
  FROM pg_trigger trigger_value
  JOIN pg_class class ON class.oid = trigger_value.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE NOT trigger_value.tgisinternal
    AND ((namespace.nspname IN ('public', 'app_private', 'geography_admin')
          AND class.relname NOT IN ('_prisma_migrations', 'messaging_migration_test_sentinel'))
      OR (namespace.nspname = 'auth' AND class.relname = 'users'))

  UNION ALL
  SELECT 'function', namespace.nspname || '.' || procedure.proname || '(' || pg_get_function_identity_arguments(procedure.oid) || ')',
         concat_ws('|', procedure.prokind, procedure.prosecdef, procedure.provolatile,
           coalesce(procedure.proconfig::text, ''), coalesce(procedure.proacl::text, ''),
           pg_get_functiondef(procedure.oid))
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  LEFT JOIN pg_depend extension_dependency
    ON extension_dependency.classid = 'pg_proc'::regclass
   AND extension_dependency.objid = procedure.oid
   AND extension_dependency.deptype = 'e'
  WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')
    AND extension_dependency.objid IS NULL

  UNION ALL
  SELECT 'policy', policy.schemaname || '.' || policy.tablename || '.' || policy.policyname,
         concat_ws('|', policy.permissive, policy.roles::text, policy.cmd,
           coalesce(policy.qual, ''), coalesce(policy.with_check, ''))
  FROM pg_policies policy
  WHERE policy.schemaname IN ('public', 'app_private', 'geography_admin')
     OR (policy.schemaname = 'storage' AND policy.tablename = 'objects')
     OR (policy.schemaname = 'realtime' AND policy.tablename = 'messages')

  UNION ALL
  SELECT 'enum', namespace.nspname || '.' || type_value.typname || '.' || enum_value.enumsortorder,
         enum_value.enumlabel
  FROM pg_enum enum_value
  JOIN pg_type type_value ON type_value.oid = enum_value.enumtypid
  JOIN pg_namespace namespace ON namespace.oid = type_value.typnamespace
  WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')

  UNION ALL
  SELECT 'schema', namespace.nspname, 'present'
  FROM pg_namespace namespace
  WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')

  UNION ALL
  SELECT 'extension', extension.extname,
         namespace.nspname || '|' || extension.extversion
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname IN ('postgis', 'pgcrypto')

  UNION ALL
  SELECT 'storage_bucket', bucket.id,
         concat_ws('|', bucket.name, bucket.public, bucket.file_size_limit,
           bucket.allowed_mime_types::text)
  FROM storage.buckets bucket
  WHERE bucket.id IN ('profile-photos', 'property-images', 'verification-documents')
)
SELECT category, identity, definition
FROM catalog
ORDER BY category, identity, definition
`;

const privilegeSql = `
WITH roles(role_name) AS (
  VALUES ('anon'::text), ('authenticated'::text), ('service_role'::text)
), privileges(privilege_name) AS (
  VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text),
         ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)
), app_tables AS (
  SELECT namespace.nspname AS schema_name, class.relname
  FROM pg_class class
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')
    AND class.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND class.relname NOT IN ('_prisma_migrations', 'messaging_migration_test_sentinel')
)
SELECT 'table'::text AS kind,
       role.role_name || ':' || app_table.schema_name || '.' || app_table.relname || ':' || privilege.privilege_name AS identity
FROM roles role
CROSS JOIN privileges privilege
CROSS JOIN app_tables app_table
WHERE has_table_privilege(
  role.role_name,
  format('%I.%I', app_table.schema_name, app_table.relname),
  privilege.privilege_name
)
UNION ALL
SELECT 'schema', role.role_name || ':' || namespace.nspname || ':USAGE'
FROM roles role
CROSS JOIN pg_namespace namespace
WHERE namespace.nspname IN ('public', 'app_private', 'geography_admin')
  AND has_schema_privilege(role.role_name, namespace.oid, 'USAGE')
ORDER BY kind, identity
`;

await assertTargets();

const [upgrade, fresh] = await Promise.all([
  capture(upgradeUrl, upgradeSentinel, "historical upgrade"),
  capture(freshUrl, freshSentinel, "supported baseline"),
]);

const upgradeJson = JSON.stringify(upgrade.rows);
const freshJson = JSON.stringify(fresh.rows);
if (upgradeJson !== freshJson) {
  const upgradeMap = new Map(upgrade.rows.map((row) => [`${row.category}:${row.identity}`, row.definition]));
  const freshMap = new Map(fresh.rows.map((row) => [`${row.category}:${row.identity}`, row.definition]));
  const keys = [...new Set([...upgradeMap.keys(), ...freshMap.keys()])].sort();
  const differences = keys
    .filter((key) => upgradeMap.get(key) !== freshMap.get(key))
    .slice(0, 20)
    .map((key) => ({
      key,
      fresh: freshMap.has(key) ? freshMap.get(key) : "<missing>",
      upgrade: upgradeMap.has(key) ? upgradeMap.get(key) : "<missing>",
    }));
  throw new Error(`Supported baseline catalog differs from the historical upgrade catalog: ${JSON.stringify(differences)}`);
}

const upgradePrivileges = new Set(upgrade.privileges.map((row) => `${row.kind}:${row.identity}`));
const freshPrivileges = new Set(fresh.privileges.map((row) => `${row.kind}:${row.identity}`));
const broaderFreshPrivileges = [...freshPrivileges].filter((privilege) => !upgradePrivileges.has(privilege));
if (broaderFreshPrivileges.length > 0) {
  throw new Error(`Supported baseline grants browser/server API roles broader access than the historical upgrade: ${JSON.stringify(broaderFreshPrivileges)}`);
}
const tightenedPrivileges = [...upgradePrivileges].filter((privilege) => !freshPrivileges.has(privilege));

process.stdout.write(`${JSON.stringify({
  catalogRows: fresh.rows.length,
  fingerprint: sha256(freshJson),
  fresh: fresh.metadata,
  freshRolePrivileges: freshPrivileges.size,
  status: "passed",
  tightenedRolePrivileges: tightenedPrivileges.length,
  upgrade: upgrade.metadata,
  upgradeRolePrivileges: upgradePrivileges.size,
}, null, 2)}\n`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
