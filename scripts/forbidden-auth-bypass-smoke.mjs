import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const excludedDirs = new Set([
  ".artifacts",
  ".certs",
  ".git",
  ".next",
  "node_modules",
]);
const excludedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".zip",
]);
const excludedFiles = new Set([
  "tsconfig.tsbuildinfo",
]);
const de = "de";
const mo = "mo";
const forbidden = [
  [de + mo, "-session"].join(""),
  [de + mo, " cookie"].join(""),
  ["ENABLE", "_" + de.toUpperCase() + mo.toUpperCase() + "_AUTH"].join(""),
  ["LIBER", "_" + de.toUpperCase() + mo.toUpperCase()].join(""),
  [de + mo, "-auth"].join(""),
  ["liber", "_" + de + mo].join(""),
];

const hits = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      if (relativePath.split(path.sep).includes("generated")) continue;
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (excludedFiles.has(entry.name)) continue;
    if (excludedExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    let text;
    try {
      text = await readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      for (const needle of forbidden) {
        if (lower.includes(needle.toLowerCase())) {
          hits.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          break;
        }
      }
    });
  }
}

await walk(root);

if (hits.length > 0) {
  console.error(`Forbidden auth-bypass strings found:\n${hits.join("\n")}`);
  process.exit(1);
}

console.log("no forbidden auth-bypass strings found");
