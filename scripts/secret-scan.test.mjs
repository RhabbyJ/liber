import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import test from "node:test";

import { formatFindings, scanWorkspace, scanZipBuffer } from "./secret-scan.mjs";

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

let crcTable;
function crc32(contents) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }
  let checksum = 0xffffffff;
  for (const byte of contents) checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const contents = Buffer.from(entry.contents, "utf8");
    const method = entry.store ? 0 : 8;
    const compressed = entry.store ? contents : deflateRawSync(contents);
    const checksum = crc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(ZIP_LOCAL_FILE_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

test("scans stored and deflated textual ZIP entries without emitting values", () => {
  const serviceRoleValue = ["eyJhbGciOiJIUzI1NiJ9", "c2VydmljZV9yb2xl", "signature-value"].join(".");
  const archive = makeZip([
    {
      name: "apps/web/.env.local",
      contents: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_public_value\nSUPABASE_SERVICE_ROLE_KEY=${serviceRoleValue}`,
    },
    {
      name: "notes.txt",
      contents: "No credentials in this stored entry.",
      store: true,
    },
  ]);

  const findings = scanZipBuffer(archive, "packet.zip");
  assert.deepEqual(findings, [
    {
      line: 2,
      path: "packet.zip!apps/web/.env.local",
      rule: "supabase-service-role",
    },
  ]);
  assert.doesNotMatch(formatFindings(findings), new RegExp(serviceRoleValue.replaceAll(".", "\\.")));
});

test("detects privileged environment credentials but ignores explicit public keys", () => {
  const archive = makeZip([
    {
      name: ".env.local",
      contents: [
        "DATABASE_URL=postgresql://postgres.project:strong-db-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres",
        "DIRECT_URL=postgresql://postgres.project:strong-direct-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres",
        "RESEND_API_KEY=re_private-provider-key-value-1234",
        "ATTOM_API_KEY=private-attom-key-value",
        "CRON_SECRET=a-long-private-maintenance-secret",
        "AUTH_RATE_LIMIT_PEPPER=a-private-rate-limit-pepper-value",
        "VERCEL_TOKEN=a-private-vercel-deployment-token",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-jwt-value",
        "NEXT_PUBLIC_MAPBOX_TOKEN=pk.public-map-token",
        "CRON_SECRET=$" + "{CRON_SECRET}",
      ].join("\n"),
    },
  ]);

  assert.deepEqual(
    scanZipBuffer(archive, "packet.zip").map(({ line, rule }) => ({ line, rule })),
    [
      { line: 1, rule: "database-url" },
      { line: 2, rule: "database-url" },
      { line: 3, rule: "resend-key" },
      { line: 4, rule: "attom-key" },
      { line: 5, rule: "cron-secret" },
      { line: 6, rule: "auth-rate-limit-pepper" },
      { line: 7, rule: "vercel-token" },
    ],
  );
});

test("detects privileged credentials assigned through quoted JSON keys", () => {
  const archive = makeZip([{
    name: "deployment.json",
    contents: JSON.stringify({
      CRON_SECRET: "a-long-private-maintenance-secret",
      DATABASE_URL: "postgresql://postgres.project:strong-db-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres",
    }, null, 2),
  }]);

  assert.deepEqual(
    scanZipBuffer(archive, "packet.zip").map(({ line, rule }) => ({ line, rule })),
    [
      { line: 2, rule: "cron-secret" },
      { line: 3, rule: "database-url" },
    ],
  );
});

test("rejects traversal entry names without extracting them", () => {
  const findings = scanZipBuffer(
    makeZip([{ name: "../outside.env", contents: "CRON_SECRET=a-private-value" }]),
    "packet.zip",
  );

  assert.deepEqual(findings, [
    {
      line: 1,
      path: "packet.zip![unsafe-entry]",
      rule: "archive-unsafe-entry",
    },
  ]);
});

test("fails closed when an entry or entry count exceeds the configured limit", () => {
  const archive = makeZip([
    { name: "first.txt", contents: "first entry" },
    { name: "second.txt", contents: "second entry" },
  ]);

  assert.equal(scanZipBuffer(archive, "packet.zip", { maxEntries: 1 })[0].rule, "archive-too-many-entries");
  assert.equal(
    scanZipBuffer(archive, "packet.zip", { maxEntryUncompressedBytes: 4 })[0].rule,
    "archive-entry-too-large",
  );
});

test("rejects nested and malformed ZIP archives", () => {
  const nested = scanZipBuffer(
    makeZip([{ name: "nested.zip", contents: "not really another archive" }]),
    "packet.zip",
  );
  assert.equal(nested[0].rule, "archive-nested-zip-unsupported");

  const malformed = scanZipBuffer(Buffer.from("not a zip"), "packet.zip");
  assert.equal(malformed[0].rule, "archive-invalid-zip");
});

test("detects modern tokens and private-key header variants without broad placeholder bypasses", () => {
  const archive = makeZip([{
    name: "secrets.txt",
    contents: [
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "github_pat_1234567890_abcdefghijklmnop",
      "ATTOM_API_KEY=actual-example-secret-value",
    ].join("\n"),
  }]);

  assert.deepEqual(
    scanZipBuffer(archive, "packet.zip").map(({ line, rule }) => ({ line, rule })),
    [
      { line: 1, rule: "private-key" },
      { line: 2, rule: "private-key" },
      { line: 3, rule: "private-key" },
      { line: 4, rule: "github-token" },
      { line: 5, rule: "attom-key" },
    ],
  );
});

test("rejects nonempty directory entries and scans nested self-named files", () => {
  const nonemptyDirectory = scanZipBuffer(
    makeZip([{ name: "folder/", contents: "hidden content" }]),
    "packet.zip",
  );
  assert.equal(nonemptyDirectory[0].rule, "archive-nonempty-directory");

  const nestedSelfName = scanZipBuffer(makeZip([{
    name: "nested/secret-scan.mjs",
    contents: 'const CRON_SECRET = "a-real-private-maintenance-value";',
  }]), "packet.zip");
  assert.deepEqual(nestedSelfName.map(({ path: findingPath, rule }) => ({ path: findingPath, rule })), [{
    path: "packet.zip!nested/secret-scan.mjs",
    rule: "cron-secret",
  }]);
});

test("scans force-tracked local environment files but ignores untracked developer env files", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "liber-secret-scan-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: workspace });
    await mkdir(path.join(workspace, "generated"));
    await mkdir(path.join(workspace, "tracked"));
    await writeFile(
      path.join(workspace, ".env.local"),
      "SUPABASE_SERVICE_ROLE_KEY=untracked-private-value-1234\n",
    );
    await writeFile(
      path.join(workspace, "tracked", ".env.production.local"),
      "SUPABASE_SERVICE_ROLE_KEY=tracked-private-value-123456\n",
    );
    await writeFile(
      path.join(workspace, "generated", ".env.local"),
      "SUPABASE_SERVICE_ROLE_KEY=generated-private-value-1234\n",
    );
    await writeFile(path.join(workspace, "tracked", "opaque.txt"), Buffer.from([0xc3, 0x28]));
    execFileSync("git", [
      "-c",
      "core.autocrlf=false",
      "add",
      "-f",
      "generated/.env.local",
      "tracked/.env.production.local",
      "tracked/opaque.txt",
    ], {
      cwd: workspace,
    });

    assert.deepEqual(await scanWorkspace(workspace), [
      {
        line: 1,
        path: "generated/.env.local",
        rule: "supabase-service-role",
      },
      {
        line: 1,
        path: "tracked/.env.production.local",
        rule: "supabase-service-role",
      },
      {
        line: 1,
        path: "tracked/opaque.txt",
        rule: "tracked-opaque-file",
      },
    ]);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
