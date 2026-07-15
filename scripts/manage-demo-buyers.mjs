import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { supabaseProjectRef } from "./database-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "ceo-preview";
const AUDIT_ACTION = "seed_demo_buyer";
const CODES = ["alpha", "echo", "kilo", "oscar", "tango", "zulu"];
const SUBTYPES = { Condo: "CONDO", House: "HOME", Land: "LAND", Manufactured: "MANUFACTURED", Townhouse: "TOWNHOUSE" };
const AMENITIES = new Set(["Pool", "Parking", "ADU", "Yard", "Garage"]);

export const DEMO_SCENARIOS = Object.freeze([
  demo("alpha", {
    alias: "Elm Harbor", purchaseType: "Cash", propertyType: "House", area: "burbank",
    budget: [700_000, 950_000], downPayment: [700_000, 950_000],
    bio: "CEO demo buyer Alpha. This test profile validates a cash buyer seeking a move-in-ready house in Burbank with a yard and garage.",
    criteria: { bedroomsMin: 3, bathroomsMin: 2, squareFeetMin: 1_600, squareFeetMax: 2_400, lotSizeMin: 4_500, lotSizeMax: 8_000, yearBuiltMin: 1970, condition: "Move-in ready", features: ["Yard", "Garage"] },
  }),
  demo("echo", {
    alias: "Bright Hearth", purchaseType: "Conventional financing", propertyType: "Condo", area: "glendale",
    budget: [450_000, 650_000], downPayment: [90_000, 130_000],
    bio: "CEO demo buyer Echo. This test profile validates a conventionally financed condo search in Glendale with pool and parking preferences.",
    criteria: { bedroomsMin: 2, bathroomsMin: 2, squareFeetMin: 1_000, squareFeetMax: 1_600, lotSizeMin: 800, lotSizeMax: 3_000, yearBuiltMin: 1990, condition: "Mild fixer", features: ["Pool", "Parking"] },
  }),
  demo("kilo", {
    alias: "Bright Terrace", purchaseType: "Other", propertyType: "Townhouse", area: "encino",
    budget: [800_000, 1_100_000], downPayment: [240_000, 400_000],
    bio: "CEO demo buyer Kilo. This test profile validates an alternative-financing townhouse search in Encino with parking and a garage.",
    criteria: { bedroomsMin: 3, bathroomsMin: 3, squareFeetMin: 1_800, squareFeetMax: 2_800, lotSizeMin: 1_500, lotSizeMax: 4_000, yearBuiltMin: 1990, condition: "Move-in ready", features: ["Parking", "Garage"] },
  }),
  demo("oscar", {
    alias: "Granite Key", purchaseType: "Conventional financing", propertyType: "Manufactured", area: "91325",
    budget: [300_000, 500_000], downPayment: [60_000, 125_000],
    bio: "CEO demo buyer Oscar. This test profile validates a manufactured-home fixer search in Northridge ZIP 91325 with parking and a yard.",
    criteria: { bedroomsMin: 2, bathroomsMin: 2, squareFeetMin: 900, squareFeetMax: 1_500, lotSizeMin: 3_000, lotSizeMax: 6_500, yearBuiltMin: 1970, condition: "Fixer", features: ["Parking", "Yard"] },
  }),
  demo("tango", {
    alias: "Still Harbor", purchaseType: "Cash", propertyType: "Land", area: "tarzana",
    budget: [600_000, 1_200_000], downPayment: [600_000, 1_200_000],
    bio: "CEO demo buyer Tango. This test profile validates a cash land search in Tarzana with broad condition criteria and no required amenities.",
    criteria: { bedroomsMin: null, bathroomsMin: null, squareFeetMin: null, squareFeetMax: null, lotSizeMin: 7_500, lotSizeMax: 25_000, yearBuiltMin: null, condition: null, features: [] },
  }),
  demo("zulu", {
    alias: "Bluebell Porch", purchaseType: "Conventional financing", propertyType: "House", area: "91604",
    budget: [1_200_000, 1_700_000], downPayment: [250_000, 450_000],
    bio: "CEO demo buyer Zulu. This test profile validates a conventionally financed Studio City house search with flexible space and outdoor amenities.",
    criteria: { bedroomsMin: 4, bathroomsMin: 4, squareFeetMin: 2_500, squareFeetMax: 4_000, lotSizeMin: 5_000, lotSizeMax: 10_000, yearBuiltMin: 2010, condition: "Mild fixer", features: ["Pool", "ADU", "Yard", "Garage"] },
  }),
]);

function demo(code, value) {
  const title = code[0].toUpperCase() + code.slice(1);
  return Object.freeze({
    ...value,
    code,
    email: `liber-demo-buyer-${code}-20260711@example.com`,
    market: "los-angeles",
    name: `Liber Demo Buyer ${title}`,
    propertySubtype: SUBTYPES[value.propertyType],
  });
}

export function validateCommand(command) {
  assert(["seed", "verify", "cleanup"].includes(command), "Command must be one of: seed, verify, cleanup.");
  return command;
}

export function validateRuntimeConfig(env, { workspaceRoot = ROOT } = {}) {
  assert(env.LIBER_ALLOW_DEMO_SEED === "true", "LIBER_ALLOW_DEMO_SEED must equal true.");
  assert(env.LIBER_CEO_PREVIEW_TARGET === TARGET, `LIBER_CEO_PREVIEW_TARGET must equal ${TARGET}.`);
  const credentialsPath = env.LIBER_CEO_PREVIEW_CREDENTIALS_FILE?.trim();
  assert(credentialsPath && path.isAbsolute(credentialsPath), "LIBER_CEO_PREVIEW_CREDENTIALS_FILE must be an absolute path.");
  assert(!isPathInside(workspaceRoot, credentialsPath), "LIBER_CEO_PREVIEW_CREDENTIALS_FILE must be outside the repository.");
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const directUrl = env.DIRECT_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert(supabaseUrl && directUrl && serviceRoleKey, "Supabase URL, DIRECT_URL, and service role key are required.");
  let apiRef;
  let dbRef;
  try {
    apiRef = supabaseProjectRef(supabaseUrl);
    dbRef = supabaseProjectRef(directUrl);
  } catch {
    throw new Error("Supabase API and DIRECT_URL must be valid Supabase URLs.");
  }
  assert(apiRef && dbRef && apiRef === dbRef, "Supabase API and DIRECT_URL project refs do not match.");
  return { credentialsPath: path.resolve(credentialsPath), directUrl, projectRef: apiRef, serviceRoleKey, supabaseUrl };
}

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function validateScenarioConfig(items = DEMO_SCENARIOS) {
  assert(items.length === 6 && items.map((item) => item.code).join("|") === CODES.join("|"), "Exact A-Z demo scenarios are required.");
  assert(new Set(items.map((item) => item.email)).size === 6, "Demo emails must be unique.");
  for (const item of items) {
    assert(item.email === `liber-demo-buyer-${item.code}-20260711@example.com`, `${item.code} demo email does not match.`);
    assert(item.name.startsWith("Liber Demo Buyer ") && /CEO demo buyer/.test(item.bio) && /test profile/.test(item.bio), `${item.code} is not clearly demo.`);
    assert(SUBTYPES[item.propertyType] === item.propertySubtype, `${item.code} property subtype does not match.`);
    assert(item.criteria.features.every((feature) => AMENITIES.has(feature)), `${item.code} has a non-canonical amenity.`);
    assert(!/verified|pre-approved|proof of funds|guaranteed|completed transaction/i.test(item.bio), `${item.code} contains a fake trust claim.`);
    assert(!["badges", "documents", "invites"].some((key) => Object.hasOwn(item, key)), `${item.code} contains forbidden trust data.`);
  }
  return items;
}

export function validateCredentialsDocument(document, items = DEMO_SCENARIOS) {
  assert(document && typeof document === "object" && !Array.isArray(document), "Credentials must be a JSON object.");
  let rows;
  if (Array.isArray(document.accounts)) {
    assert(Object.keys(document).length === 1, "Credentials manifest may contain only accounts.");
    rows = document.accounts;
  } else {
    assert(Object.keys(document).sort().join("|") === [...CODES].sort().join("|"), "Credentials must contain exactly six accounts.");
    rows = items.map((item) => ({ code: item.code, name: item.name, ...document[item.code] }));
  }
  assert(rows.length === 6, "Credentials must contain exactly six accounts.");
  const byCode = new Map(rows.map((row) => [row.code, row]));
  assert(byCode.size === 6, "Credential account codes must be unique.");
  const passwords = new Set();
  const result = {};
  for (const item of items) {
    const row = byCode.get(item.code);
    const names = item.code === "alpha" ? [item.name, "Demo Buyer Alpha"] : [item.name];
    assert(names.includes(row?.name) && normalizeEmail(row?.email) === item.email, `Credentials do not match ${item.code}.`);
    assert(typeof row.password === "string" && row.password.length >= 12, `${item.code} password must contain at least 12 characters.`);
    assert(!passwords.has(row.password), "Demo passwords must be distinct.");
    passwords.add(row.password);
    result[item.code] = { email: item.email, password: row.password };
  }
  return result;
}

function loadCredentials(config) {
  let file;
  try {
    file = realpathSync(config.credentialsPath);
    assert(!isPathInside(ROOT, file), "Credentials file resolves inside the repository.");
    return validateCredentialsDocument(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof Error && /Credentials|password/.test(error.message)) throw error;
    throw new Error("External credentials file could not be read as JSON.");
  }
}

async function clients(config) {
  const [{ createClient }, { PrismaPg }, { PrismaClient }] = await Promise.all([
    import("@supabase/supabase-js"), import("@prisma/adapter-pg"), import("../packages/db/src/generated/client/index.js"),
  ]);
  return {
    admin: createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    authProbe: createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: config.directUrl, max: 1 }) }),
  };
}

async function listAuthUsers(admin) {
  const users = [];
  let page = 1;
  while (page) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1_000 });
    if (error) throw authError("list", null, error);
    users.push(...data.users);
    page = data.nextPage ?? 0;
  }
  return new Map(users.map((user) => [normalizeEmail(user.email), user]));
}

async function ensureAuthUser(admin, current, item, credential) {
  const attributes = {
    email: item.email, email_confirm: true, password: credential.password,
    user_metadata: { demo_callsign: item.code, demo_seed_target: TARGET, name: item.name, role: "buyer" },
  };
  const response = current
    ? await admin.auth.admin.updateUserById(current.id, attributes)
    : await admin.auth.admin.createUser(attributes);
  if (response.error) throw authError(current ? "update" : "create", item.code, response.error);
  assert(normalizeEmail(response.data.user?.email) === item.email, `Auth returned the wrong identity for ${item.code}.`);
  return response.data.user;
}

async function assertNoTrustData(db, userId, profileId, code) {
  const [badges, documents, invites] = await Promise.all([
    profileId ? db.buyerBadge.count({ where: { buyerProfileId: profileId } }) : 0,
    db.verificationDocument.count({ where: { OR: [{ userId }, ...(profileId ? [{ buyerProfileId: profileId }] : [])] } }),
    db.invite.count({ where: { OR: [{ sellerId: userId }, ...(profileId ? [{ buyerProfileId: profileId }] : [])] } }),
  ]);
  assert(badges + documents + invites === 0, `${code} has badges, documents, or invites; refusing mutation.`);
}

async function preflightAuthMutation(prisma, current, item) {
  const [appUser, emailOwner, area] = await Promise.all([
    current
      ? prisma.user.findUnique({ where: { id: current.id }, include: { buyerProfile: { select: { id: true } } } })
      : null,
    prisma.user.findUnique({ where: { email: item.email }, include: { buyerProfile: { select: { id: true } } } }),
    prisma.serviceArea.findFirst({
      where: { active: true, slug: item.area, market: { active: true, slug: item.market } },
      select: { id: true },
    }),
  ]);
  assert(area, `Active service area ${item.area} is missing.`);
  if (!current) {
    assert(!emailOwner, `${item.code} application email exists without its Auth identity.`);
    return;
  }
  assert(normalizeEmail(current.email) === item.email, `${item.code} Auth email does not match.`);
  assert(!current.user_metadata?.demo_seed_target || current.user_metadata.demo_seed_target === TARGET, `${item.code} Auth identity belongs to another seed target.`);
  assert(!current.user_metadata?.demo_callsign || current.user_metadata.demo_callsign === item.code, `${item.code} Auth callsign does not match.`);
  assert(!isActivelyBanned(current), `${item.code} Auth identity is banned; refusing mutation.`);
  assert(appUser && emailOwner?.id === current.id, `${item.code} Auth/application identity does not match.`);
  assert(appUser.name === item.name && appUser.status === "ACTIVE", `${item.code} application identity is not the expected demo account.`);
  assert(appUser.roles.length === 1 && appUser.roles[0] === "BUYER", `${item.code} is not BUYER-only; refusing mutation.`);
  await assertNoTrustData(prisma, current.id, appUser.buyerProfile?.id, item.code);
}

function profileData(item, area) {
  const city = area.type === "neighborhood" ? area.label : area.city ?? area.label;
  return {
    bio: item.bio, budgetMin: item.budget[0], budgetMax: item.budget[1], buyerType: item.purchaseType,
    buyingPurpose: item.propertyType, displayName: item.alias, downPaymentMin: item.downPayment[0], downPaymentMax: item.downPayment[1],
    desiredCity: city, desiredLat: area.centerLat, desiredLng: area.centerLng,
    desiredLocationText: area.type === "zip" && area.postalCode ? `${city}, ${area.state} ${area.postalCode}` : `${area.label}, ${area.state}`,
    desiredNeighborhood: area.type === "neighborhood" ? area.label : null, desiredPostalCode: area.postalCode, desiredState: area.state,
  };
}

function criteriaData(item) {
  return { ...item.criteria, priceMin: item.budget[0], priceMax: item.budget[1], propertyCategory: "HOME", propertySubtype: item.propertySubtype };
}

async function writeProfile(tx, userId, item) {
  const area = await tx.serviceArea.findFirst({
    where: { active: true, slug: item.area, market: { active: true, slug: item.market } }, include: { market: true },
  });
  assert(area, `Active service area ${item.area} is missing.`);
  const profile = await tx.buyerProfile.upsert({
    where: { userId },
    create: { ...profileData(item, area), lastRefreshedAt: new Date(), userId, visibilityStatus: "DRAFT" },
    update: { ...profileData(item, area), lastRefreshedAt: new Date(), visibilityStatus: "DRAFT" },
    select: { id: true },
  });
  await tx.buyerDesiredServiceArea.deleteMany({ where: { buyerProfileId: profile.id } });
  await tx.buyerDesiredServiceArea.create({ data: { buyerProfileId: profile.id, isPrimary: true, serviceAreaId: area.id, source: "SELECTED" } });
  await tx.buyerCriteria.upsert({
    where: { buyerProfileId: profile.id }, create: { ...criteriaData(item), buyerProfileId: profile.id }, update: criteriaData(item),
  });
  await tx.adminAuditLog.deleteMany({ where: { action: AUDIT_ACTION, targetId: profile.id, targetType: "buyer_profile" } });
  await tx.adminAuditLog.create({
    data: { action: AUDIT_ACTION, actorUserId: userId, metadata: { code: item.code, email: item.email, seedTarget: TARGET }, targetId: profile.id, targetType: "buyer_profile" },
  });
  await tx.buyerProfile.update({ where: { id: profile.id }, data: { visibilityStatus: "ACTIVE" } });
  return profile.id;
}

async function seedOne(prisma, authUser, item) {
  await prisma.$transaction(async (tx) => {
    const appUser = await tx.user.findUnique({ where: { id: authUser.id }, include: { buyerProfile: { select: { id: true } } } });
    assert(appUser, `${item.code} Auth trigger did not create its application User.`);
    const emailOwner = await tx.user.findUnique({ where: { email: item.email }, select: { id: true } });
    assert(emailOwner?.id === authUser.id, `${item.code} application email belongs to another UUID.`);
    await assertNoTrustData(tx, authUser.id, appUser.buyerProfile?.id, item.code);
    await tx.user.update({ where: { id: authUser.id }, data: { email: item.email, name: item.name, roles: ["BUYER"], status: "ACTIVE", suspendedAt: null } });
    const profileId = await writeProfile(tx, authUser.id, item);
    await assertNoTrustData(tx, authUser.id, profileId, item.code);
  }, { isolationLevel: "Serializable" });
}

async function verifyOne(prisma, authUser, item) {
  assert(authUser && authUser.email_confirmed_at && authUser.user_metadata?.demo_seed_target === TARGET, `${item.code} Auth identity is missing or unmarked.`);
  assert(authUser.user_metadata?.demo_callsign === item.code && !isActivelyBanned(authUser), `${item.code} Auth identity is not usable or cleanup-safe.`);
  const user = await prisma.user.findUnique({
    where: { email: item.email },
    include: { buyerProfile: { include: { criteria: true, desiredServiceAreas: { include: { serviceArea: { include: { market: true } } } } } } },
  });
  assert(user?.id === authUser.id && user.name === item.name && user.status === "ACTIVE", `${item.code} Auth/application identity does not match.`);
  assert(user.roles.length === 1 && user.roles[0] === "BUYER", `${item.code} is not BUYER-only.`);
  const profile = user.buyerProfile;
  assert(profile?.visibilityStatus === "ACTIVE" && profile.displayName === item.alias, `${item.code} profile is missing or inactive.`);
  assertFields(profile, { ...profileData(item, profile.desiredServiceAreas[0]?.serviceArea ?? {}), visibilityStatus: "ACTIVE" }, item.code);
  assert(profile.criteria.length === 1 && profile.desiredServiceAreas.length === 1, `${item.code} must have one criteria and one service area.`);
  assertFields(profile.criteria[0], criteriaData(item), item.code);
  const selection = profile.desiredServiceAreas[0];
  assert(selection.isPrimary && selection.source === "SELECTED" && selection.serviceArea.slug === item.area, `${item.code} selection does not match.`);
  assert(selection.serviceArea.active && selection.serviceArea.market.active && selection.serviceArea.market.slug === item.market, `${item.code} market is inactive.`);
  await assertNoTrustData(prisma, user.id, profile.id, item.code);
  assert(await prisma.adminAuditLog.count({ where: { action: AUDIT_ACTION, targetId: profile.id } }) === 1, `${item.code} seed audit is missing.`);
}

async function verifyPasswordSignIn(authProbe, authUser, item, credential) {
  const { data, error } = await authProbe.auth.signInWithPassword({ email: item.email, password: credential.password });
  if (error) throw authError("password verification", item.code, error);
  try {
    assert(data.session && data.user?.id === authUser.id && normalizeEmail(data.user.email) === item.email, `${item.code} credentials resolved to the wrong Auth identity.`);
  } finally {
    if (data.session) {
      const { error: signOutError } = await authProbe.auth.signOut({ scope: "local" });
      if (signOutError) throw authError("password verification sign-out", item.code, signOutError);
    }
  }
}

function assertFields(actual, expected, code) {
  for (const [key, value] of Object.entries(expected)) {
    const current = actual[key];
    const matches = Array.isArray(value)
      ? [...current].sort().join("|") === [...value].sort().join("|")
      : typeof value === "number" ? Number(current) === value : (current ?? null) === (value ?? null);
    assert(matches, `${code} ${key} does not match.`);
  }
}

async function restoreApp(prisma, authUser, item) {
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id: authUser.id, email: item.email, name: item.name, roles: ["BUYER"], status: "ACTIVE" } });
    await writeProfile(tx, authUser.id, item);
  });
}

async function cleanupOne(prisma, admin, authUser, item) {
  const appUser = await prisma.user.findUnique({
    where: { email: item.email }, include: { buyerProfile: { include: { desiredServiceAreas: { include: { serviceArea: true } } } } },
  });
  if (!authUser && !appUser) return [];
  assert(authUser && normalizeEmail(authUser.email) === item.email, `${item.code} Auth identity does not match; refusing cleanup.`);
  assert(authUser.user_metadata?.demo_seed_target === TARGET && authUser.user_metadata?.demo_callsign === item.code, `${item.code} Auth identity is not marked for cleanup.`);
  assert(!appUser || (appUser.id === authUser.id && appUser.name === item.name), `${item.code} application identity does not match; refusing cleanup.`);
  const ids = [authUser.id, ...(appUser?.buyerProfile ? [appUser.buyerProfile.id] : [])];
  if (appUser) {
    assert(appUser.roles.length === 1 && appUser.roles[0] === "BUYER", `${item.code} is not BUYER-only; refusing cleanup.`);
    assert(appUser.buyerProfile?.bio === item.bio && appUser.buyerProfile.desiredServiceAreas[0]?.serviceArea.slug === item.area, `${item.code} profile is not the exact demo scenario.`);
    await assertNoTrustData(prisma, appUser.id, appUser.buyerProfile.id, item.code);
    await prisma.$transaction(async (tx) => {
      await assertNoTrustData(tx, appUser.id, appUser.buyerProfile.id, item.code);
      await tx.adminAuditLog.deleteMany({ where: { OR: [{ actorUserId: appUser.id }, { targetId: { in: ids } }] } });
      await tx.user.delete({ where: { id: appUser.id } });
    });
  }

  // The deployed Auth FK is ON DELETE RESTRICT, so app deletion must precede Auth deletion.
  const { error } = await admin.auth.admin.deleteUser(authUser.id, false);
  if (error) {
    if (appUser) {
      try { await restoreApp(prisma, authUser, item); } catch { /* Auth may already be gone. */ }
    }
    throw authError("delete", item.code, error);
  }
  return ids;
}

async function runSeed(prisma, admin, authProbe, credentials) {
  const authUsers = await listAuthUsers(admin);
  for (const item of DEMO_SCENARIOS) {
    const current = authUsers.get(item.email);
    await preflightAuthMutation(prisma, current, item);
    const authUser = await ensureAuthUser(admin, current, item, credentials[item.code]);
    authUsers.set(item.email, authUser);
    await seedOne(prisma, authUser, item);
  }
  await runVerify(prisma, admin, authProbe, credentials);
  console.log("Seeded and verified six CEO-preview demo buyers.");
}

async function runVerify(prisma, admin, authProbe, credentials) {
  const authUsers = await listAuthUsers(admin);
  for (const item of DEMO_SCENARIOS) {
    const authUser = authUsers.get(item.email);
    await verifyOne(prisma, authUser, item);
    await verifyPasswordSignIn(authProbe, authUser, item, credentials[item.code]);
  }
  console.log("Verified six CEO-preview demo buyers.");
}

async function runCleanup(prisma, admin) {
  const authUsers = await listAuthUsers(admin);
  const ids = [];
  for (const item of DEMO_SCENARIOS) ids.push(...await cleanupOne(prisma, admin, authUsers.get(item.email), item));
  const remainingAuth = await listAuthUsers(admin);
  assert(!DEMO_SCENARIOS.some((item) => remainingAuth.has(item.email)), "A demo Auth user remains after cleanup.");
  assert(await prisma.user.count({ where: { email: { in: DEMO_SCENARIOS.map((item) => item.email) } } }) === 0, "A demo app user remains after cleanup.");
  if (ids.length) assert(await prisma.adminAuditLog.count({ where: { targetId: { in: ids } } }) === 0, "A target audit row remains after cleanup.");
  console.log("Cleaned six CEO-preview demo buyers.");
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const command = validateCommand(argv[0]);
  validateScenarioConfig();
  const config = validateRuntimeConfig(env);
  const credentials = loadCredentials(config);
  const { admin, authProbe, prisma } = await clients(config);
  try {
    if (command === "seed") await runSeed(prisma, admin, authProbe, credentials);
    if (command === "verify") await runVerify(prisma, admin, authProbe, credentials);
    if (command === "cleanup") await runCleanup(prisma, admin);
  } finally {
    await prisma.$disconnect();
  }
}

function authError(action, code, error) {
  return new Error(`Supabase Auth ${action} failed${code ? ` for ${code}` : ""} (${error?.code ?? "unknown"}).`);
}
function isActivelyBanned(user) {
  const bannedUntil = Date.parse(user?.banned_until ?? "");
  return Number.isFinite(bannedUntil) && bannedUntil > Date.now();
}
function normalizeEmail(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function assert(condition, message) { if (!condition) throw new Error(message); }

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) runCli().catch((error) => { console.error(error instanceof Error ? error.message : "Demo buyer command failed."); process.exitCode = 1; });
