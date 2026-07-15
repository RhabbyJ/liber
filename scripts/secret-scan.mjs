import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify, TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_ENCRYPTED_FLAG = 0x0001;
const ZIP_DATA_DESCRIPTOR_FLAG = 0x0008;
const ARCHIVE_SENTINEL = "[archive]";
const UNSAFE_ENTRY_SENTINEL = "[unsafe-entry]";
const execFileAsync = promisify(execFile);

export const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 64 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryNameBytes: 1024,
  maxEntryUncompressedBytes: 4 * 1024 * 1024,
  maxTotalTextBytes: 32 * 1024 * 1024,
});

const excludedDirectories = new Set([
  ".artifacts",
  ".certs",
  ".git",
  ".next",
  "generated",
  "node_modules",
]);
const excludedExtensions = new Set([
  ".7z",
  ".avi",
  ".db",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".sqlite",
  ".tar",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);
const excludedWorkspaceFiles = new Set([
  "apps/web/tsconfig.tsbuildinfo",
  "packages/validators/tsconfig.tsbuildinfo",
  "scripts/secret-scan.mjs",
  "scripts/secret-scan.test.mjs",
]);

function isAllowedValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    /^(?:<redacted>|<secret>|changeme|placeholder|replace-me|your-secret)(?:[-_].*)?$/.test(normalized) ||
    /^(?:ci[-_])?only[-_]not[-_]real(?:[-_].*)?$/.test(normalized) ||
    /^(?:ci[-_])?only[-_]not[-_]a[-_]secret(?:[-_].*)?$/.test(normalized) ||
    /(?:^|[-_])ci[-_]only[-_]not[-_]real(?:$|[-_])/.test(normalized) ||
    /^\$\{?[A-Z0-9_]+\}?$/i.test(value) ||
    /^(?:config|env|process\.env)\.[A-Z0-9_.]+$/i.test(value)
  );
}

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

function assignedValueDetector(variablePattern, minimumLength = 8) {
  const pattern = new RegExp(
    `(?:^|[^A-Z0-9_])(?:"(?:${variablePattern})"|'(?:${variablePattern})'|(?:${variablePattern}))\\s*[:=]\\s*(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`|([^\\s#;]+))`,
    "i",
  );
  return (line, displayPath) => {
    const match = pattern.exec(line);
    if (!match) return false;
    const value = match[1] ?? match[2] ?? match[3] ?? match[4];
    const isQuoted = match[1] !== undefined || match[2] !== undefined || match[3] !== undefined;
    if (!isQuoted && sourceExtensions.has(path.extname(displayPath).toLowerCase())) return false;
    return value.length >= minimumLength && !isAllowedValue(value);
  };
}

function databaseUrlDetector(line) {
  const match = /(?:^|[^A-Z0-9_])(?:"(?:[A-Z0-9_]*DATABASE_URL|[A-Z0-9_]*DIRECT_URL)"|'(?:[A-Z0-9_]*DATABASE_URL|[A-Z0-9_]*DIRECT_URL)'|(?:[A-Z0-9_]*DATABASE_URL|[A-Z0-9_]*DIRECT_URL))\s*[:=]\s*["']?(postgres(?:ql)?:\/\/[^\s"'#]+)/i.exec(
    line,
  );
  if (!match || isAllowedValue(match[1])) return false;

  try {
    const databaseUrl = new URL(match[1]);
    const hostname = databaseUrl.hostname.toLowerCase();
    const localHosts = new Set(["127.0.0.1", "::1", "localhost"]);
    if (
      !databaseUrl.password ||
      localHosts.has(hostname) ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".invalid") ||
      hostname === "example.com"
    ) {
      return false;
    }

    return !isAllowedValue(decodeURIComponent(databaseUrl.password));
  } catch {
    return false;
  }
}

const rules = [
  {
    name: "private-key",
    detects: (line) => /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/.test(line),
  },
  { name: "database-url", detects: databaseUrlDetector },
  {
    name: "supabase-service-role",
    detects: assignedValueDetector("SUPABASE_SERVICE_ROLE_KEY", 16),
  },
  {
    name: "resend-key",
    detects: assignedValueDetector("RESEND_API_KEY", 12),
  },
  {
    name: "attom-key",
    detects: assignedValueDetector("ATTOM_API_KEY"),
  },
  {
    name: "cron-secret",
    detects: assignedValueDetector("CRON_SECRET"),
  },
  {
    name: "auth-rate-limit-pepper",
    detects: assignedValueDetector("AUTH_RATE_LIMIT_PEPPER", 16),
  },
  {
    name: "vercel-token",
    detects: assignedValueDetector(
      "VERCEL(?:_[A-Z0-9]+)*_TOKEN|VERCEL_TOKEN|TURBO_TOKEN",
      16,
    ),
  },
  { name: "aws-access-key", detects: (line) => /\bAKIA[0-9A-Z]{16}\b/.test(line) },
  { name: "github-token", detects: (line) => /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(line) },
  { name: "github-token", detects: (line) => /\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(line) },
  { name: "slack-token", detects: (line) => /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/.test(line) },
  { name: "stripe-secret", detects: (line) => /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/.test(line) },
  { name: "resend-key", detects: (line) => /\bre_[A-Za-z0-9]{24,}\b/.test(line) },
  { name: "supabase-secret", detects: (line) => /\bsb_secret_[A-Za-z0-9_-]{24,}\b/.test(line) },
  {
    name: "assigned-secret",
    detects: assignedValueDetector(
      "api[_-]?key|client[_-]?secret|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|password",
      32,
    ),
  },
];

class ZipScanFailure extends Error {
  constructor(rule, entry = ARCHIVE_SENTINEL) {
    super(rule);
    this.entry = entry;
    this.rule = rule;
  }
}

function archiveFinding(archivePath, rule, entry = ARCHIVE_SENTINEL) {
  return {
    line: 1,
    path: `${archivePath}!${entry}`,
    rule,
  };
}

function scanText(contents, displayPath) {
  const findings = [];
  contents.split(/\r?\n/).forEach((line, index) => {
    const matchedRules = new Set();
    for (const rule of rules) {
      if (matchedRules.has(rule.name) || !rule.detects(line, displayPath)) continue;
      findings.push({ line: index + 1, path: displayPath, rule: rule.name });
      matchedRules.add(rule.name);
    }
  });
  return findings;
}

function decodeText(contents) {
  if (contents.length === 0) return "";

  let encoding = "utf-8";
  let offset = 0;
  if (contents.length >= 2 && contents[0] === 0xff && contents[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
  } else if (contents.length >= 2 && contents[0] === 0xfe && contents[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
  } else if (contents.includes(0)) {
    return null;
  }

  try {
    return new TextDecoder(encoding, { fatal: true }).decode(contents.subarray(offset));
  } catch {
    return null;
  }
}

function findEndOfCentralDirectory(archive) {
  const minimumOffset = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  throw new ZipScanFailure("archive-invalid-zip");
}

function decodeEntryName(nameBytes, flags) {
  if (nameBytes.length === 0) throw new ZipScanFailure("archive-invalid-entry-name");
  if ((flags & ZIP_UTF8_FLAG) === 0 && nameBytes.some((byte) => byte > 0x7f)) {
    throw new ZipScanFailure("archive-unsupported-entry-name");
  }

  try {
    return new TextDecoder((flags & ZIP_UTF8_FLAG) === 0 ? "ascii" : "utf-8", {
      fatal: true,
    }).decode(nameBytes);
  } catch {
    throw new ZipScanFailure("archive-invalid-entry-name");
  }
}

function normalizeEntryName(entryName) {
  const normalized = entryName.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part !== "." && part !== "");
  const unsafe =
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.includes("..") ||
    parts.some((part) => part.includes(":") || /[\u0000-\u001f\u007f]/.test(part));
  if (unsafe) throw new ZipScanFailure("archive-unsafe-entry", UNSAFE_ENTRY_SENTINEL);

  const safeName = parts.join("/");
  if (!safeName && !normalized.endsWith("/")) {
    throw new ZipScanFailure("archive-invalid-entry-name");
  }
  return safeName;
}

function parseCentralDirectory(archive, limits) {
  const endOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const directoryDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const directorySize = archive.readUInt32LE(endOffset + 12);
  const directoryOffset = archive.readUInt32LE(endOffset + 16);

  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ZipScanFailure("archive-multi-disk-unsupported");
  }
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new ZipScanFailure("archive-zip64-unsupported");
  }
  if (entryCount > limits.maxEntries) throw new ZipScanFailure("archive-too-many-entries");
  if (directoryOffset + directorySize > endOffset) {
    throw new ZipScanFailure("archive-invalid-zip");
  }

  const entries = [];
  let cursor = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > directoryEnd || archive.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ZipScanFailure("archive-invalid-zip");
    }

    const flags = archive.readUInt16LE(cursor + 8);
    const compressionMethod = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new ZipScanFailure("archive-zip64-unsupported");
    }
    if (nameLength > limits.maxEntryNameBytes) {
      throw new ZipScanFailure("archive-entry-name-too-long");
    }
    if (recordEnd > directoryEnd) throw new ZipScanFailure("archive-invalid-zip");

    const rawName = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const decodedName = decodeEntryName(rawName, flags);
    const entryName = normalizeEntryName(decodedName);
    entries.push({
      checksum,
      compressedSize,
      compressionMethod,
      entryName,
      flags,
      isDirectory: decodedName.replaceAll("\\", "/").endsWith("/"),
      localHeaderOffset,
      rawName,
      uncompressedSize,
    });
    cursor = recordEnd;
  }

  if (cursor !== directoryEnd) throw new ZipScanFailure("archive-invalid-zip");
  return { directoryOffset, entries };
}

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
  for (const byte of contents) {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function extractEntry(archive, entry, directoryOffset, limits) {
  const entryLabel = entry.entryName || ARCHIVE_SENTINEL;
  const offset = entry.localHeaderOffset;
  if (offset + 30 > directoryOffset || archive.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new ZipScanFailure("archive-invalid-local-entry", entryLabel);
  }

  const localFlags = archive.readUInt16LE(offset + 6);
  const localMethod = archive.readUInt16LE(offset + 8);
  const localChecksum = archive.readUInt32LE(offset + 14);
  const localCompressedSize = archive.readUInt32LE(offset + 18);
  const localUncompressedSize = archive.readUInt32LE(offset + 22);
  const localNameLength = archive.readUInt16LE(offset + 26);
  const localExtraLength = archive.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataOffset + entry.compressedSize;

  if (
    localFlags !== entry.flags ||
    localMethod !== entry.compressionMethod ||
    dataEnd > directoryOffset ||
    localNameLength !== entry.rawName.length ||
    !archive.subarray(offset + 30, offset + 30 + localNameLength).equals(entry.rawName)
  ) {
    throw new ZipScanFailure("archive-invalid-local-entry", entryLabel);
  }
  if (
    (entry.flags & ZIP_DATA_DESCRIPTOR_FLAG) === 0 &&
    (localChecksum !== entry.checksum ||
      localCompressedSize !== entry.compressedSize ||
      localUncompressedSize !== entry.uncompressedSize)
  ) {
    throw new ZipScanFailure("archive-invalid-local-entry", entryLabel);
  }
  if ((entry.flags & ZIP_ENCRYPTED_FLAG) !== 0) {
    throw new ZipScanFailure("archive-encrypted-entry", entryLabel);
  }
  if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
    throw new ZipScanFailure("archive-entry-too-large", entryLabel);
  }

  const compressed = archive.subarray(dataOffset, dataEnd);
  let contents;
  try {
    if (entry.compressionMethod === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        throw new ZipScanFailure("archive-invalid-local-entry", entryLabel);
      }
      contents = compressed;
    } else if (entry.compressionMethod === 8) {
      contents = inflateRawSync(compressed, {
        maxOutputLength: limits.maxEntryUncompressedBytes + 1,
      });
    } else {
      throw new ZipScanFailure("archive-unsupported-compression", entryLabel);
    }
  } catch (error) {
    if (error instanceof ZipScanFailure) throw error;
    throw new ZipScanFailure("archive-decompression-failed", entryLabel);
  }

  if (contents.length !== entry.uncompressedSize || crc32(contents) !== entry.checksum) {
    throw new ZipScanFailure("archive-checksum-mismatch", entryLabel);
  }
  return contents;
}

function isExcludedWorkspaceFile(filePath) {
  return excludedWorkspaceFiles.has(filePath.replaceAll("\\", "/"));
}

function isExcludedExtension(filePath) {
  return excludedExtensions.has(path.extname(filePath).toLowerCase());
}

function isLocalEnvironmentFile(fileName) {
  return fileName === ".env" || fileName === ".env.local" || /^\.env\..+\.local$/i.test(fileName);
}

export function scanZipBuffer(archive, archivePath, customLimits = {}) {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...customLimits };
  if (archive.length > limits.maxArchiveBytes) {
    return [archiveFinding(archivePath, "archive-too-large")];
  }

  try {
    const { directoryOffset, entries } = parseCentralDirectory(archive, limits);
    const findings = [];
    let totalCandidateBytes = 0;
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (entry.uncompressedSize > 0) {
          throw new ZipScanFailure("archive-nonempty-directory", entry.entryName);
        }
        continue;
      }
      if (path.extname(entry.entryName).toLowerCase() === ".zip") {
        throw new ZipScanFailure("archive-nested-zip-unsupported", entry.entryName);
      }
      if (isExcludedExtension(entry.entryName)) continue;

      if (totalCandidateBytes + entry.uncompressedSize > limits.maxTotalTextBytes) {
        throw new ZipScanFailure("archive-text-budget-exceeded", entry.entryName);
      }
      totalCandidateBytes += entry.uncompressedSize;
      const contents = extractEntry(archive, entry, directoryOffset, limits);
      const text = decodeText(contents);
      if (text === null) throw new ZipScanFailure("archive-opaque-entry", entry.entryName);
      findings.push(...scanText(text, `${archivePath}!${entry.entryName}`));
    }
    return findings;
  } catch (error) {
    if (error instanceof ZipScanFailure) {
      return [archiveFinding(archivePath, error.rule, error.entry)];
    }
    return [archiveFinding(archivePath, "archive-invalid-zip")];
  }
}

export async function scanWorkspace(workspaceRoot = process.cwd(), customLimits = {}) {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...customLimits };
  const findings = [];
  const trackedFiles = await readTrackedFiles(workspaceRoot);
  const trackedPaths = trackedFiles ? [...trackedFiles] : [];

  async function walk(directory, trackedOnly = false) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git") continue;
        if (excludedDirectories.has(entry.name)) {
          if (!trackedFiles) continue;
          const prefix = `${path.relative(workspaceRoot, fullPath).split(path.sep).join("/")}/`;
          if (!trackedPaths.some((filePath) => filePath.startsWith(prefix))) continue;
          await walk(fullPath, true);
        } else {
          await walk(fullPath, trackedOnly);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const displayPath = path.relative(workspaceRoot, fullPath).split(path.sep).join("/");
      if (trackedOnly && (!trackedFiles || !trackedFiles.has(displayPath))) continue;
      if (isExcludedWorkspaceFile(displayPath)) continue;
      if (isLocalEnvironmentFile(entry.name) && trackedFiles && !trackedFiles.has(displayPath)) continue;
      if (path.extname(entry.name).toLowerCase() === ".zip") {
        try {
          const metadata = await stat(fullPath);
          if (metadata.size > limits.maxArchiveBytes) {
            findings.push(archiveFinding(displayPath, "archive-too-large"));
            continue;
          }
          findings.push(...scanZipBuffer(await readFile(fullPath), displayPath, limits));
        } catch {
          findings.push(archiveFinding(displayPath, "archive-unreadable"));
        }
        continue;
      }
      if (isExcludedExtension(entry.name)) continue;

      let contents;
      try {
        contents = decodeText(await readFile(fullPath));
      } catch {
        if (trackedFiles?.has(displayPath)) {
          findings.push({ line: 1, path: displayPath, rule: "tracked-unreadable-file" });
        }
        continue;
      }
      if (contents === null) {
        if (trackedFiles?.has(displayPath)) {
          findings.push({ line: 1, path: displayPath, rule: "tracked-opaque-file" });
        }
        continue;
      }
      findings.push(...scanText(contents, displayPath));
    }
  }

  await walk(workspaceRoot);
  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.line - right.line || left.rule.localeCompare(right.rule),
  );
}

async function readTrackedFiles(workspaceRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return new Set(stdout.split("\0").filter(Boolean).map((filePath) => filePath.replaceAll("\\", "/")));
  } catch {
    return null;
  }
}

export function formatFindings(findings) {
  return findings.map((finding) => `- ${finding.path}:${finding.line} [${finding.rule}]`).join("\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const findings = await scanWorkspace();
  if (findings.length > 0) {
    console.error("Potential committed secrets or unsafe archives found (values intentionally omitted):");
    console.error(formatFindings(findings));
    process.exitCode = 1;
  } else {
    console.log("repository text and workspace ZIP secret scan passed");
  }
}
