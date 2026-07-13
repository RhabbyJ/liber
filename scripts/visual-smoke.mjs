import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const externalBaseUrl = process.env.VISUAL_SMOKE_BASE_URL;
const port = externalBaseUrl ? null : process.env.VISUAL_SMOKE_PORT ? Number(process.env.VISUAL_SMOKE_PORT) : await availablePort(3200);
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const artifactDir = path.resolve(".artifacts", "visual-smoke");
const profileDir = path.resolve(".artifacts", "chrome-profile");
let settleBaseUrl = null;
let settleServer = null;

const firefoxCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    ]
  : ["firefox"];
const chromeCandidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ]
  : ["google-chrome", "chromium", "chromium-browser", "msedge"];

async function executablePath(candidates) {
  for (const candidate of candidates) {
    if (process.platform === "win32") {
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    const found = spawnSync("which", [candidate], { encoding: "utf8" });
    if (found.status === 0) return found.stdout.trim();
  }

  return null;
}

async function browserInfo() {
  const firefox = await executablePath(firefoxCandidates);
  if (firefox) return { kind: "firefox", path: firefox };

  const chromium = await executablePath(chromeCandidates);
  if (chromium) return { kind: "chromium", path: chromium };

  throw new Error("No Firefox, Chrome, or Edge executable was found for visual smoke screenshots.");
}

const child = externalBaseUrl
  ? null
  : spawn(
      npmCommand,
      ["run", "dev", "-w", "@liber/web", "--", "--port", String(port)],
      {
        env: process.env,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

let output = "";
child?.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child?.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

function stopServer() {
  if (!child) return;
  if (child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
  child.stdout.destroy();
  child.stderr.destroy();
}

async function availablePort(start) {
  for (let candidate = start; candidate < start + 100; candidate += 1) {
    if (await canListen(candidate)) return candidate;
  }

  throw new Error(`No available visual smoke test port found from ${start} to ${start + 99}.`);
}

function canListen(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(portToCheck, () => {
      server.close(() => resolve(true));
    });
  });
}

async function startSettleServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestedDelay = Number(requestUrl.searchParams.get("ms"));
    const delay = Number.isFinite(requestedDelay) ? Math.min(Math.max(requestedDelay, 0), 5_000) : 0;

    setTimeout(() => {
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Content-Type": "application/javascript",
      });
      response.end(";");
    }, delay);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Visual smoke settle server did not bind to a TCP port.");
  }

  settleServer = server;
  settleBaseUrl = `http://127.0.0.1:${address.port}`;
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (child && child.exitCode !== null) {
      throw new Error(`Dev server exited before visual smoke checks.\n${output}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Dev server did not become ready.\n${output}`);
}

async function resolvedPageUrl(target) {
  const response = await fetch(`${baseUrl}${target.path}`, {
    redirect: "manual",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${target.path} returned ${response.status}.`);
  }

  for (const marker of target.markers ?? []) {
    if (!body.includes(marker)) {
      throw new Error(`${target.path} is missing marker before screenshot: ${marker}`);
    }
  }

  let snapshotBody = body
    .replace("<head>", `<head><base href="${baseUrl}/">`)
    .replaceAll('href="/', `href="${baseUrl}/`)
    .replaceAll('src="/', `src="${baseUrl}/`);

  if (target.settleMs && settleBaseUrl) {
    const settleScript = `<script src="${settleBaseUrl}/settle.js?ms=${target.settleMs}"></script>`;
    snapshotBody = snapshotBody.replace("</body>", `${settleScript}</body>`);
  }

  const html = await inlineStyles(snapshotBody);
  const htmlPath = path.join(artifactDir, `${target.file}.html`);
  await writeFile(htmlPath, html);
  return pathToFileURL(htmlPath).href;
}

async function inlineStyles(html) {
  const stylesheetPattern = /<link rel="stylesheet" href="([^"]+)"[^>]*>/g;
  let output = html;

  for (const match of html.matchAll(stylesheetPattern)) {
    const href = match[1];
    const response = await fetch(href);
    if (!response.ok) {
      throw new Error(`Unable to fetch stylesheet for visual smoke: ${href}`);
    }
    const css = await response.text();
    output = output.replace(match[0], `<style>${css}</style>`);
  }

  return output;
}

async function verifyPng(filePath, expectedWidth, expectedHeight) {
  const buffer = await readFile(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${filePath} is not a PNG screenshot.`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${filePath} has dimensions ${width}x${height}, expected ${expectedWidth}x${expectedHeight}.`);
  }

  if (buffer.length < 10_000) {
    throw new Error(`${filePath} looks too small to be a rendered page screenshot.`);
  }
}

function screenshotArgs(browser, target, filePath) {
  if (browser.kind === "firefox") {
    return [
      "--headless",
      "--profile",
      profileDir,
      "--window-size",
      `${target.width},${target.height}`,
      "--screenshot",
      filePath,
      target.resolvedUrl,
    ];
  }

  return [
    "--headless",
    "--disable-software-rasterizer",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
    "--in-process-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--window-size=${target.width},${target.height}`,
    `--screenshot=${filePath}`,
    target.resolvedUrl,
  ];
}

async function screenshot(browser, target) {
  const filePath = path.join(artifactDir, target.file);
  target.resolvedUrl = await resolvedPageUrl(target);
  const result = await new Promise((resolve, reject) => {
    let stderr = "";
    let stdout = "";
    const screenshotProcess = spawn(browser.path, screenshotArgs(browser, target, filePath), {
      env: {
        ...process.env,
        MOZ_DISABLE_CONTENT_SANDBOX: "1",
      },
    });
    const timeout = setTimeout(() => {
      screenshotProcess.kill();
      reject(new Error(`Screenshot timed out for ${target.file}.\n${stdout}\n${stderr}`));
    }, 30_000);

    screenshotProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    screenshotProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    screenshotProcess.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    screenshotProcess.once("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stderr, stdout });
    });
  });

  if (result.status !== 0) {
    throw new Error(`Screenshot failed for ${target.file}.\n${result.stdout}\n${result.stderr}`);
  }

  await verifyPng(filePath, target.width, target.height);
  console.log(`ok ${target.file}`);
}

let exitCode = 0;

try {
  const browser = await browserInfo();
  await rm(artifactDir, { force: true, recursive: true });
  await rm(profileDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await startSettleServer();
  await waitForServer();

  const targets = [
    { file: "desktop-home.png", height: 1000, path: "/", settleMs: 2500, width: 1440 },
    { file: "desktop-login.png", height: 900, markers: ["Log in", "Email"], path: "/login", width: 1440 },
    { file: "desktop-signup.png", height: 900, markers: ["What brings you to Liber?", "Looking to buy a home"], path: "/signup", width: 1440 },
    { file: "mobile-home.png", height: 844, path: "/", settleMs: 2500, width: 390 },
    { file: "mobile-login.png", height: 844, markers: ["Log in", "Email"], path: "/login", width: 390 },
  ];

  for (const target of targets) {
    await screenshot(browser, target);
  }

  console.log(`visual smoke screenshots written to ${artifactDir}`);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  stopServer();
  settleServer?.close();
}

process.exit(exitCode);
