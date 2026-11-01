// Launch readiness check. Run after a production build:
//   NEXT_PUBLIC_SITE_URL=https://your-domain npm run build && npm run check:launch
// Fails (exit 1) while required content is missing; warnings do not fail.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "out");
const errors = [];
const warnings = [];

async function exists(p) {
  return stat(p).then(
    () => true,
    () => false,
  );
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? htmlFiles(path.join(dir, e.name)) : e.name.endsWith(".html") ? [path.join(dir, e.name)] : [])),
  );
  return files.flat();
}

if (!(await exists(out))) {
  console.error("No out/ folder. Run `npm run build` first.");
  process.exit(1);
}

// 1. Visible placeholders left in the built pages.
for (const file of await htmlFiles(out)) {
  const html = await readFile(file, "utf8");
  const labels = [...html.matchAll(/Placeholder: (?:<!-- -->)?([^<]+)</g)].map((m) => m[1].trim());
  for (const label of new Set(labels)) errors.push(`Placeholder on /${path.relative(out, file).replace(/index\.html$/, "")}: ${label}`);
}

// 2. Public site URL (canonical links, sitemap, social cards).
const sitemap = await readFile(path.join(out, "sitemap.xml"), "utf8").catch(() => "");
if (!sitemap || sitemap.includes("localhost")) errors.push("NEXT_PUBLIC_SITE_URL was not set for this build (canonical URLs and social cards point at localhost).");

// 3. Configuration in content/site.ts that is still unset.
const config = await readFile(path.join(root, "content/site.ts"), "utf8");
const unset = (key) => new RegExp(`\\b${key}:\\s*null\\b`).test(config);
if (unset("partnerFormEndpoint") && unset("partnerEmail")) errors.push("Partner inquiries have no destination: set partnerFormEndpoint or contact.partnerEmail.");
for (const [key, label] of [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["communityGuidelines", "Community Guidelines"],
]) {
  if (unset(key)) errors.push(`${label} link is not set (legal.${key}).`);
}
for (const [key, label] of [
  ["ios", "App Store"],
  ["android", "Google Play"],
]) {
  if (new RegExp(`badges:[\\s\\S]*?\\b${key}:\\s*null`).test(config)) warnings.push(`Official ${label} badge not added (badges.${key}); plain text buttons are shown instead.`);
}
if (/socials:\s*\[\]/.test(config)) warnings.push("No social profiles configured (socials).");

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} item(s) must be resolved before launch.`);
  process.exit(1);
}
console.log("\nReady to launch.");
