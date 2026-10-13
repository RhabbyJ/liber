process.stderr.write(
  "Auth security staging verification is unavailable for the current schema.\n"
  + "The retired harness used suspend_identity, legacy outbox columns, and direct Storage writes.\n"
  + "Run npm run test --workspace @liber/web -- server/auth-operations.sql.test.ts for isolated worker coverage.\n"
  + "Public launch still requires a new disposable-environment proof of the current suspension command, "
  + "Auth ban/session revocation, UploadSession Storage controls, and fresh-UUID email reuse.\n"
  + "No staging fixtures or database changes were made; this command is not a passing security gate.\n",
);
process.exitCode = 1;
