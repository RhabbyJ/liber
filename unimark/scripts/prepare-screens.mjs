// Prepares app screenshots and icons for the site.
//
//   npm run images
//
// Screens: every image in assets/screens-src/ becomes public/screens/<name>-<width>.webp
// in two widths, with the phone screen's rounded corners baked in as transparency.
// The current sources are App Store marketing frames (921×2000) with the phone screen
// at a fixed position; plain device screenshots (no frame) are used uncropped.
//
// Icons: the app-icon artwork becomes the Apple touch icon and the web-manifest icons.
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "assets/screens-src");
const outDir = path.join(root, "public/screens");
const WIDTHS = [360, 653];
// Corner radius as a fraction of screen width (measured from the source frames).
const CORNER = 0.153;

// Screen area inside the device bezel of a 921×2000 App Store frame (1px inset to drop bezel anti-aliasing).
const FRAME_921 = { left: 134, top: 489, width: 653, height: 1422 };

function roundedMask(width, height, radius) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
}

async function prepareScreen(file) {
  const name = path.parse(file).name;
  const input = sharp(path.join(srcDir, file));
  const meta = await input.metadata();
  const crop = meta.width === 921 && meta.height === 2000 ? FRAME_921 : null;
  const base = crop ? input.extract(crop) : input;
  const source = await base.png().toBuffer();
  const { width, height } = await sharp(source).metadata();

  for (const w of WIDTHS) {
    const h = Math.round((height / width) * w);
    const resized = await sharp(source).resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
    await sharp(resized)
      .composite([{ input: roundedMask(w, h, Math.round(w * CORNER)), blend: "dest-in" }])
      .webp({ quality: 86, alphaQuality: 90, effort: 6, smartSubsample: true })
      .toFile(path.join(outDir, `${name}-${w}.webp`));
  }
  return `${name} (${width}×${height})`;
}

async function prepareIcons() {
  const svg = path.join(root, "public/brand/unimark-app-icon.svg");
  await sharp(svg, { density: 600 }).resize(180, 180).png().toFile(path.join(root, "app/apple-icon.png"));
  for (const size of [192, 512]) {
    await sharp(svg, { density: 600 }).resize(size, size).png().toFile(path.join(root, `public/icon-${size}.png`));
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const files = (await readdir(srcDir)).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).sort();
for (const f of files) console.log("screen:", await prepareScreen(f));
await prepareIcons();
console.log("icons: app/apple-icon.png, public/icon-192.png, public/icon-512.png");
