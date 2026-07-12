import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const readinessScript = path.resolve("scripts/readiness-check.mjs");

test("production readiness requires a sufficiently long Auth rate-limit pepper", () => {
  const result = spawnSync(process.execPath, [readinessScript, "--production"], {
    cwd: path.dirname(readinessScript),
    encoding: "utf8",
    env: {
      ...process.env,
      AUTH_RATE_LIMIT_PEPPER: "too-short",
      CRON_SECRET: "",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters/);
});
