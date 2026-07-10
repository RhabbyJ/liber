import assert from "node:assert/strict";
import test from "node:test";
import { sameDatabaseTarget } from "./database-target.mjs";

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

function withPassword(value, password) {
  const url = new URL(value);
  url.password = password;
  return url.toString();
}
