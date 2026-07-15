import "dotenv/config";
import { randomUUID } from "node:crypto";
import process from "node:process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { sameDatabaseTarget, supabaseProjectRef } from "./database-target.mjs";

const databaseUrl = process.env.AUTH_SECURITY_STAGING_DATABASE_URL;
const supabaseUrl = process.env.AUTH_SECURITY_STAGING_SUPABASE_URL;
const publishableKey = process.env.AUTH_SECURITY_STAGING_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.AUTH_SECURITY_STAGING_SERVICE_ROLE_KEY;
const sentinel = process.env.AUTH_SECURITY_STAGING_SENTINEL;

await assertDisposableStaging();

const suffix = randomUUID();
const adminEmail = `auth-security-admin-${suffix}@example.invalid`;
const targetEmail = `auth-security-target-${suffix}@example.invalid`;
const password = `Liber-${randomUUID()}-Aa1!`;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminBrowserClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new pg.Client({ connectionString: databaseUrl });

let actorId;
let targetId;
let freshId;
let activeReadPath;
let deniedReadPath;
let propertyImagePath;
let deniedPropertyImagePath;

await db.connect();
try {
  const actor = await requireAuthResult(admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password,
    user_metadata: { name: "Auth Security Test Admin" },
  }));
  actorId = actor.user.id;

  const signup = await requireAuthResult(publicClient.auth.signUp({
    email: targetEmail,
    password,
    options: { data: { name: "Auth Security Test Target", role: "seller" } },
  }));
  if (!signup.user?.id) throw new Error("Staging signup did not create an Auth identity.");
  targetId = signup.user.id;
  await requireAuthResult(admin.auth.admin.updateUserById(targetId, { email_confirm: true }));

  const initialTarget = await db.query(
    `SELECT cardinality(roles)::int AS role_count
     FROM public."User" WHERE id = $1`,
    [targetId],
  );
  if (initialTarget.rows[0]?.role_count !== 0) {
    throw new Error("User-editable signup metadata initialized an application role.");
  }

  await db.query(
    `UPDATE public."User" SET roles = ARRAY['ADMIN']::public."UserRole"[] WHERE id = $1`,
    [actorId],
  );
  await db.query(
    `UPDATE public."User" SET roles = ARRAY['SELLER']::public."UserRole"[] WHERE id = $1`,
    [targetId],
  );
  await db.query(
    `INSERT INTO public."SellerAccess" (id, "userId", status, "createdAt", "updatedAt")
     VALUES ($1, $2, 'APPROVED', now(), now())`,
    [`auth-security-access-${suffix}`, targetId],
  );
  const propertyId = `auth-security-property-${suffix}`;
  await db.query(
    `INSERT INTO public."SellerProperty" (
       id, "ownerUserId", "propertyType", "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'HOME', now(), now())`,
    [propertyId, targetId],
  );
  const signedIn = await requireAuthResult(publicClient.auth.signInWithPassword({
    email: targetEmail,
    password,
  }));
  if (!signedIn.session) throw new Error("Confirmed staging identity did not establish a session.");

  activeReadPath = `${targetId}/auth-security-active-${suffix}.pdf`;
  deniedReadPath = `${targetId}/auth-security-denied-${suffix}.pdf`;
  const targetStorage = publicClient;
  const upload = await targetStorage.storage
    .from("verification-documents")
    .upload(activeReadPath, Buffer.from("%PDF-1.4\n% Liber auth security staging proof\n"), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upload.error) throw upload.error;
  const denialFixture = await targetStorage.storage
    .from("verification-documents")
    .upload(deniedReadPath, Buffer.from("%PDF-1.4\n% Uncached suspension proof\n"), {
      cacheControl: "0",
      contentType: "application/pdf",
      upsert: false,
    });
  if (denialFixture.error) throw denialFixture.error;
  const beforeSuspension = await targetStorage.storage.from("verification-documents").download(activeReadPath);
  if (beforeSuspension.error) throw beforeSuspension.error;

  await requireAuthResult(adminBrowserClient.auth.signInWithPassword({
    email: adminEmail,
    password,
  }));
  const directAdminRead = await adminBrowserClient.storage
    .from("verification-documents")
    .download(activeReadPath);
  if (!directAdminRead.error) {
    throw new Error("Authenticated admin bypassed the server-mediated document review path.");
  }

  propertyImagePath = `${propertyId}/auth-security-active-${suffix}.png`;
  deniedPropertyImagePath = `${propertyId}/auth-security-denied-${suffix}.png`;
  const initialImageBytes = Buffer.from("89504e470d0a1a0a00", "hex");
  const activeImageBytes = Buffer.from("89504e470d0a1a0a01", "hex");
  const suspendedImageBytes = Buffer.from("89504e470d0a1a0a02", "hex");
  await uploadAndUpdateImage(
    targetStorage,
    "property-images",
    propertyImagePath,
    initialImageBytes,
    activeImageBytes,
  );
  const operationId = `auth-security-operation-${suffix}`;
  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE public."User" SET status = 'SUSPENDED', "suspendedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [targetId],
    );
    await db.query(
      `UPDATE public."SellerAccess" SET status = 'SUSPENDED', "updatedAt" = now()
       WHERE "userId" = $1`,
      [targetId],
    );
    await db.query(
      `UPDATE public."SellerProperty" SET status = 'ARCHIVED', "flaggedForReviewAt" = now(), "updatedAt" = now()
       WHERE "ownerUserId" = $1`,
      [targetId],
    );
    await db.query(
      `INSERT INTO public."AuthOperation" (
         id, "userId", type, status, attempts, "idempotencyKey", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'BAN_USER', 'PENDING', 0, $3, now(), now())`,
      [operationId, targetId, `ban-user:${targetId}`],
    );
    await db.query(
      `INSERT INTO public."AdminAuditLog" (
         id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt"
       ) VALUES ($1, $2, 'suspend_user', 'user', $3, $4::jsonb, now())`,
      [randomUUID(), actorId, targetId, JSON.stringify({ authOperationId: operationId })],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  const banned = await requireAuthResult(admin.auth.admin.updateUserById(targetId, {
    ban_duration: "876000h",
  }));
  if (!banned.user?.banned_until) throw new Error("Staging Auth ban was not confirmed.");
  await db.query(
    `UPDATE public."AuthOperation"
     SET status = 'COMPLETED', "completedAt" = now(), "updatedAt" = now()
     WHERE id = $1`,
    [operationId],
  );

  const deniedUpload = await targetStorage.storage
    .from("verification-documents")
    .upload(`${targetId}/denied-${suffix}.pdf`, Buffer.from("%PDF-1.4\n"), {
      contentType: "application/pdf",
    });
  if (!deniedUpload.error) throw new Error("Suspended JWT uploaded directly through Storage.");
  const deniedRead = await targetStorage.storage.from("verification-documents").download(deniedReadPath);
  if (!deniedRead.error) throw new Error("Suspended JWT read directly through Storage.");
  await assertSuspendedImageWritesDenied({
    activeBytes: activeImageBytes,
    adminClient: admin,
    bucket: "property-images",
    database: db,
    deniedPath: deniedPropertyImagePath,
    label: "property image",
    path: propertyImagePath,
    suspendedBytes: suspendedImageBytes,
    suspendedClient: targetStorage,
  });
  const state = await db.query(
    `SELECT
       (SELECT status::text FROM public."User" WHERE id = $1) AS user_status,
       (SELECT status::text FROM public."SellerAccess" WHERE "userId" = $1) AS seller_status,
       (SELECT status::text FROM public."AuthOperation" WHERE id = $2) AS auth_operation_status`,
    [targetId, operationId],
  );
  const suspensionState = state.rows[0];
  if (
    suspensionState?.user_status !== "SUSPENDED"
    || suspensionState?.seller_status !== "SUSPENDED"
    || suspensionState?.auth_operation_status !== "COMPLETED"
  ) {
    throw new Error(`Suspension state mismatch: ${JSON.stringify(state.rows[0])}`);
  }

  await admin.storage.from("verification-documents").remove([activeReadPath, deniedReadPath]);
  await admin.storage
    .from("property-images")
    .remove([propertyImagePath, deniedPropertyImagePath].filter(Boolean));
  await db.query(
    `INSERT INTO public."AdminAuditLog" (
       id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt"
     ) VALUES ($1, $2, 'account_purge_started', 'user', $3, $4::jsonb, now())`,
    [randomUUID(), actorId, targetId, JSON.stringify({ storageCleanupConfirmed: true })],
  );
  await db.query(`DELETE FROM public."User" WHERE id = $1`, [targetId]);
  await requireAuthResult(admin.auth.admin.deleteUser(targetId));
  await db.query(
    `INSERT INTO public."AdminAuditLog" (
       id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt"
     ) VALUES ($1, $2, 'account_purge_completed', 'user', $3, $4::jsonb, now())`,
    [randomUUID(), actorId, targetId, JSON.stringify({ emailReuseAllowed: true })],
  );

  const fresh = await requireAuthResult(publicClient.auth.signUp({
    email: targetEmail.toUpperCase(),
    password,
    options: { data: { name: "Fresh Auth Security Identity", role: "buyer" } },
  }));
  freshId = fresh.user?.id;
  if (!freshId || freshId === targetId) throw new Error("Email reuse did not create a fresh UUID.");
  const freshState = await db.query(
    `SELECT
       cardinality(roles) AS role_count,
       (SELECT count(*)::int FROM public."SellerAccess" WHERE "userId" = $1) AS seller_access,
       (SELECT count(*)::int FROM public."BuyerProfile" WHERE "userId" = $1) AS buyer_profiles,
       (SELECT count(*)::int FROM public."SellerProperty" WHERE "ownerUserId" = $1) AS properties
     FROM public."User" WHERE id = $1`,
    [freshId],
  );
  const freshIdentity = freshState.rows[0];
  if (
    freshIdentity?.role_count !== 0
    || freshIdentity?.seller_access !== 0
    || freshIdentity?.buyer_profiles !== 0
    || freshIdentity?.properties !== 0
  ) {
    throw new Error(`Fresh identity inherited application state: ${JSON.stringify(freshState.rows[0])}`);
  }

  process.stdout.write(`${JSON.stringify({
    auth_ban_confirmed: true,
    auth_operation_completed: true,
    auth_metadata_role_ignored: true,
    email_reuse_fresh_uuid: true,
    property_image_writes_denied_after_suspension: true,
    storage_direct_admin_document_read_denied: true,
    storage_denied_after_suspension: true,
  }, null, 2)}\n`);
} finally {
  if (freshId) {
    await db.query(`DELETE FROM public."User" WHERE id = $1`, [freshId]).catch(() => undefined);
    await admin.auth.admin.deleteUser(freshId).catch(() => undefined);
  }
  if (targetId) {
    if (activeReadPath || deniedReadPath) {
      await admin.storage
        .from("verification-documents")
        .remove([activeReadPath, deniedReadPath].filter(Boolean))
        .catch(() => undefined);
    }
    if (propertyImagePath || deniedPropertyImagePath) {
      await admin.storage
        .from("property-images")
        .remove([propertyImagePath, deniedPropertyImagePath].filter(Boolean))
        .catch(() => undefined);
    }
    await db.query(`DELETE FROM public."User" WHERE id = $1`, [targetId]).catch(() => undefined);
    await admin.auth.admin.deleteUser(targetId).catch(() => undefined);
  }
  if (actorId) {
    await db.query(`DELETE FROM public."User" WHERE id = $1`, [actorId]).catch(() => undefined);
    await admin.auth.admin.deleteUser(actorId).catch(() => undefined);
  }
  await db.end();
}

async function uploadAndUpdateImage(client, bucket, path, initialBytes, updatedBytes) {
  const upload = await client.storage
    .from(bucket)
    .upload(path, initialBytes, { contentType: "image/png", upsert: false });
  if (upload.error) throw upload.error;
  const update = await client.storage
    .from(bucket)
    .update(path, updatedBytes, { contentType: "image/png", upsert: false });
  if (update.error) throw update.error;
}

async function assertSuspendedImageWritesDenied({
  activeBytes,
  adminClient,
  bucket,
  database,
  deniedPath,
  label,
  path,
  suspendedBytes,
  suspendedClient,
}) {
  await suspendedClient.storage
    .from(bucket)
    .upload(deniedPath, suspendedBytes, { contentType: "image/png", upsert: false });
  const deniedUpload = await database.query(
    `SELECT count(*)::int AS count FROM storage.objects
     WHERE bucket_id = $1 AND name = $2`,
    [bucket, deniedPath],
  );
  if (deniedUpload.rows[0]?.count !== 0) throw new Error(`Suspended JWT uploaded a ${label}.`);

  await suspendedClient.storage
    .from(bucket)
    .update(path, suspendedBytes, { contentType: "image/png", upsert: false });
  const deniedUpdate = await adminClient.storage.from(bucket).download(path);
  if (deniedUpdate.error) throw deniedUpdate.error;
  if (!Buffer.from(await deniedUpdate.data.arrayBuffer()).equals(activeBytes)) {
    throw new Error(`Suspended JWT updated a ${label}.`);
  }

  await suspendedClient.storage.from(bucket).remove([path]);
  const deniedDelete = await database.query(
    `SELECT count(*)::int AS count FROM storage.objects
     WHERE bucket_id = $1 AND name = $2`,
    [bucket, path],
  );
  if (deniedDelete.rows[0]?.count !== 1) throw new Error(`Suspended JWT deleted a ${label}.`);
}

async function requireAuthResult(promise) {
  const result = await promise;
  if (result.error) throw result.error;
  return result.data;
}

async function assertDisposableStaging() {
  if (
    !databaseUrl || !supabaseUrl || !publishableKey || !serviceRoleKey || !sentinel || sentinel.length < 16
    || process.env.AUTH_SECURITY_STAGING_ALLOW_WRITES !== "true"
  ) {
    throw new Error("Set the staging URL/keys/database URL, write opt-in, and 16+ character sentinel.");
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && sameDatabaseTarget(sharedUrl, databaseUrl)) {
      throw new Error("Refusing to run Auth security staging tests against the configured shared database.");
    }
  }
  const apiProjectRef = supabaseProjectRef(supabaseUrl);
  const databaseProjectRef = supabaseProjectRef(databaseUrl);
  if (!apiProjectRef || !databaseProjectRef || apiProjectRef !== databaseProjectRef) {
    throw new Error("Staging Supabase and database targets do not identify the same project.");
  }
  const guard = new pg.Client({ connectionString: databaseUrl });
  await guard.connect();
  try {
    const result = await guard.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.identity_migration_test_sentinel WHERE token = $1
       ) AS verified`,
      [sentinel],
    );
    if (!result.rows[0]?.verified) throw new Error("Disposable staging sentinel did not match.");
  } finally {
    await guard.end();
  }
}
