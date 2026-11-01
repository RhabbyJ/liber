// Visual QA: full-page screenshots of each route at phone, tablet and desktop widths.
//   npm run build && npm run preview   (in one terminal)
//   node scripts/screenshot.mjs [baseUrl] [outDir] [routes...]
// Requires Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

// CommonJS resolution so a globally installed Playwright (via NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)("playwright");

const [base = "http://localhost:4173", outDir = ".qa", ...routeArgs] = process.argv.slice(2);
const routes = routeArgs.length ? routeArgs : ["/", "/about/", "/partners/", "/contact/", "/get/", "/does-not-exist/"];
const viewports = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 820, height: 1180, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    // Scroll through so lazy images load and reveal animations settle.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += Math.round(vp.height * 0.6)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-visible")));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    const name = route === "/" ? "home" : route.replaceAll("/", "") || "root";
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${outDir}/${name}-${vp.name}.png`, fullPage: true });
    console.log(`${vp.name.padEnd(7)} ${route.padEnd(18)} h=${height} overflowX=${overflow}`);
  }
  if (errors.length) console.log(`${vp.name} errors:`, errors);
  await ctx.close();
}
await browser.close();
