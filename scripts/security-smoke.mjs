import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const externalBaseUrl = process.env.SMOKE_BASE_URL;
const port = externalBaseUrl ? null : process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : await availablePort(3200);
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const child = externalBaseUrl
  ? null
  : spawn(
      npmCommand,
      ["run", "dev", "-w", "@liber/web", "--", "--port", String(port)],
      {
        detached: process.platform !== "win32",
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
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  child.stdout.destroy();
  child.stderr.destroy();
}

async function availablePort(start) {
  for (let candidate = start; candidate < start + 100; candidate += 1) {
    if (await canListen(candidate)) return candidate;
  }
  throw new Error(`No available smoke test port found from ${start} to ${start + 99}.`);
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

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (child && child.exitCode !== null) {
      throw new Error(`Dev server exited before smoke checks.\n${output}`);
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

function expectHeader(response, name) {
  const value = response.headers.get(name);
  if (!value) throw new Error(`Missing ${name} header.`);
  return value;
}

async function expectStatus(path, status) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== status) {
    throw new Error(`${path} returned ${response.status}, expected ${status}.`);
  }
  console.log(`ok ${path} returned ${status}`);
  return response;
}

let exitCode = 0;

try {
  await waitForServer();

  const home = await fetch(baseUrl);
  expectHeader(home, "content-security-policy");
  expectHeader(home, "x-content-type-options");
  expectHeader(home, "x-frame-options");
  console.log("ok security headers");

  const buyer = await expectStatus("/buyers/security-smoke", 307);
  const robots = expectHeader(buyer, "x-robots-tag");
  if (!robots.includes("noindex") || !robots.includes("noarchive")) {
    throw new Error(`/buyers route X-Robots-Tag was ${robots}.`);
  }
  console.log("ok buyer profile robots header");

  const propertyEnrichment = await fetch(`${baseUrl}/api/property/enrich`, {
    body: JSON.stringify({ addressLine1: "1 Main", market: "los-angeles", zip: "91423" }),
    headers: { "content-type": "application/json", origin: new URL(baseUrl).origin },
    method: "POST",
    redirect: "manual",
  });
  if (propertyEnrichment.status !== 401) {
    throw new Error(`/api/property/enrich returned ${propertyEnrichment.status}, expected 401.`);
  }
  await expectStatus("/api/geo/geocode?query=Sherman", 401);
  await expectStatus("/api/seller/buyers?service_area=northridge", 401);
  await expectStatus("/api/property-images/security-smoke", 401);
  const uploadSession = await fetch(`${baseUrl}/api/uploads/sessions`, {
    body: "{}",
    headers: { "content-type": "application/json", origin: new URL(baseUrl).origin },
    method: "POST",
    redirect: "manual",
  });
  if (uploadSession.status !== 401) {
    throw new Error(`/api/uploads/sessions returned ${uploadSession.status}, expected 401.`);
  }
  console.log("ok /api/uploads/sessions returned 401");

  const badOrigin = await fetch(`${baseUrl}/api/auth/login`, {
    body: new URLSearchParams({ email: "", password: "", next: "/" }),
    headers: { origin: "https://evil.example" },
    method: "POST",
    redirect: "manual",
  });
  if (badOrigin.status !== 403) throw new Error(`Bad-origin login returned ${badOrigin.status}, expected 403.`);
  console.log("ok bad origin rejected");

  console.log("security smoke passed");
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  stopServer();
}

process.exit(exitCode);
