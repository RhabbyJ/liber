import assert from "node:assert/strict";
import test from "node:test";
import { sameDatabaseTarget } from "./database-target.mjs";

test("matches the same direct database despite credential differences", () => {
  assert.equal(
    sameDatabaseTarget(
      "postgresql://postgres:first@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres:second@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require",
    ),
    true,
  );
});

test("matches direct and pooler URLs for the same Supabase project", () => {
  assert.equal(
    sameDatabaseTarget(
      "postgresql://postgres:first@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres.abcdefghijklmnopqrst:second@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    ),
    true,
  );
});

test("does not match distinct Supabase projects", () => {
  assert.equal(
    sameDatabaseTarget(
      "postgresql://postgres:first@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres.zyxwvutsrqponmlkjihg:second@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    ),
    false,
  );
});
