import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import test from "node:test";
import {
  DEMO_SCENARIOS, validateCommand, validateCredentialsDocument,
  validateRuntimeConfig, validateScenarioConfig,
} from "./manage-demo-buyers.mjs";

const ref = "abcdefghijklmnopqrst";
const root = path.resolve("workspace", "liber");
const credentialsPath = path.resolve("workspace", "secrets", "buyers.json");
const env = () => ({
  DIRECT_URL: `postgresql://postgres.${ref}@pooler.supabase.com:5432/postgres`,
  LIBER_ALLOW_DEMO_SEED: "true", LIBER_CEO_PREVIEW_CREDENTIALS_FILE: credentialsPath,
  LIBER_CEO_PREVIEW_TARGET: "ceo-preview", NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: randomBytes(32).toString("base64url"),
});

test("allows only seed, verify, and cleanup", () => {
  for (const command of ["seed", "verify", "cleanup"]) assert.equal(validateCommand(command), command);
  assert.throws(() => validateCommand("delete"), /seed, verify, cleanup/);
});

test("requires hard guards, external credentials, and one Supabase project", () => {
  assert.equal(validateRuntimeConfig(env(), { workspaceRoot: root }).projectRef, ref);
  assert.throws(() => validateRuntimeConfig({ ...env(), LIBER_ALLOW_DEMO_SEED: "1" }, { workspaceRoot: root }), /must equal true/);
  assert.throws(() => validateRuntimeConfig({ ...env(), LIBER_CEO_PREVIEW_TARGET: "production" }, { workspaceRoot: root }), /ceo-preview/);
  assert.throws(() => validateRuntimeConfig({ ...env(), LIBER_CEO_PREVIEW_CREDENTIALS_FILE: path.join(root, "buyers.json") }, { workspaceRoot: root }), /outside/);
  assert.throws(() => validateRuntimeConfig({ ...env(), DIRECT_URL: "postgresql://postgres.otherprojectref@pooler.supabase.com/postgres" }, { workspaceRoot: root }), /do not match/);
});

test("defines six unique and safe A-Z buyer scenarios", () => {
  assert.equal(validateScenarioConfig(), DEMO_SCENARIOS);
  assert.deepEqual(DEMO_SCENARIOS.map((item) => item.code), ["alpha", "echo", "kilo", "oscar", "tango", "zulu"]);
  assert.equal(new Set(DEMO_SCENARIOS.map((item) => item.email)).size, 6);
  assert.deepEqual(new Set(DEMO_SCENARIOS.map((item) => item.purchaseType)), new Set(["Cash", "Conventional financing", "Other"]));
  assert.deepEqual(new Set(DEMO_SCENARIOS.map((item) => item.propertySubtype)), new Set(["HOME", "CONDO", "TOWNHOUSE", "MANUFACTURED", "LAND"]));
  assert.deepEqual(new Set(DEMO_SCENARIOS.flatMap((item) => item.criteria.features)), new Set(["Pool", "Parking", "ADU", "Yard", "Garage"]));
  assert(DEMO_SCENARIOS.every((item) => item.email.endsWith("@example.com") && /CEO demo buyer/.test(item.bio)));
});

test("accepts the existing accounts manifest and keyed credential format", () => {
  const accounts = DEMO_SCENARIOS.map((item) => ({
    code: item.code, email: item.email, name: item.name, password: randomBytes(24).toString("base64url"),
  }));
  assert.equal(Object.keys(validateCredentialsDocument({ accounts })).length, 6);
  accounts[0].name = "Demo Buyer Alpha";
  assert.equal(Object.keys(validateCredentialsDocument({ accounts })).length, 6);
  const keyed = Object.fromEntries(accounts.map(({ code, email, password }) => [code, { email, password }]));
  assert.equal(Object.keys(validateCredentialsDocument(keyed)).length, 6);
  const wrong = structuredClone(accounts);
  wrong[0].email = DEMO_SCENARIOS[1].email;
  assert.throws(() => validateCredentialsDocument({ accounts: wrong }), /alpha/);
  const repeated = structuredClone(accounts);
  repeated[1].password = repeated[0].password;
  assert.throws(() => validateCredentialsDocument({ accounts: repeated }), /distinct/);
});
