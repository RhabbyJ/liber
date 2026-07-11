import assert from "node:assert/strict";
import test from "node:test";
import { sameDatabaseTarget, supabaseProjectRef } from "./database-target.mjs";

test("matches the same direct database despite credential differences", () => {
  assert.equal(
    sameDatabaseTarget(
      withPassword("postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "first"),
      withPassword("postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require", "second"),
    ),
    true,
  );
});

test("matches direct and pooler URLs for the same Supabase project", () => {
  assert.equal(
    sameDatabaseTarget(
      "postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres.abcdefghijklmnopqrst@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    ),
    true,
  );
});

test("does not match distinct Supabase projects", () => {
  assert.equal(
    sameDatabaseTarget(
      "postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres.zyxwvutsrqponmlkjihg@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    ),
    false,
  );
});

test("extracts the same project reference from API, direct, and pooler URLs", () => {
  const expected = "abcdefghijklmnopqrst";
  assert.equal(supabaseProjectRef(`https://${expected}.supabase.co`), expected);
  assert.equal(supabaseProjectRef(`postgresql://postgres@db.${expected}.supabase.co:5432/postgres`), expected);
  assert.equal(
    supabaseProjectRef(`postgresql://postgres.${expected}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`),
    expected,
  );
});

function withPassword(value, password) {
  const url = new URL(value);
  url.password = password;
  return url.toString();
}
