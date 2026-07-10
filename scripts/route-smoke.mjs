import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const externalBaseUrl = process.env.SMOKE_BASE_URL;
const port = externalBaseUrl ? null : process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : await availablePort(3100);
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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
  if (!child || child.killed) return;
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

async function expectPage(path, markers) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();

  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);

  for (const marker of markers) {
    if (!body.includes(marker)) throw new Error(`${path} is missing marker: ${marker}`);
  }

  console.log(`ok ${path}`);
}

async function expectProtectedRedirect(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const location = response.headers.get("location");

  if (![302, 303, 307, 308].includes(response.status) || !location) {
    throw new Error(`${path} did not redirect. Status: ${response.status}.`);
  }

  const redirectUrl = new URL(location, baseUrl);
  if (redirectUrl.pathname !== "/login" || redirectUrl.searchParams.get("next") !== path) {
    throw new Error(`${path} redirected to ${redirectUrl.toString()}, expected /login?next=${path}.`);
  }

  console.log(`ok ${path} redirects to login`);
}

async function expectPostRedirect(path, form, expectedPath, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: new URLSearchParams(form),
    method: "POST",
    redirect: "manual",
  });
  const location = response.headers.get("location");

  if (![302, 303, 307, 308].includes(response.status) || !location) {
    throw new Error(`${path} did not redirect after POST. Status: ${response.status}.`);
  }

  const redirectUrl = new URL(location, baseUrl);
  if (redirectUrl.pathname !== expectedPath || redirectUrl.searchParams.get("status") !== expectedStatus) {
    throw new Error(`${path} redirected to ${redirectUrl.toString()}, expected ${expectedPath}?status=${expectedStatus}.`);
  }

  console.log(`ok ${path} POST redirects to ${expectedStatus}`);
}

let exitCode = 0;

try {
  await waitForServer();

  await expectPage("/", ["Liber", "Get started"]);
  await expectPage("/login", ["Log in", "Email"]);
  await expectPage("/login?status=auth-error", ["Confirmation failed"]);
  await expectPage("/login?status=missing-credentials", ["Email and password required"]);
  await expectPage("/login?status=invalid-login&email=test%40gmail.com", ["Login failed", "test@gmail.com"]);
  await expectPage("/login?status=identity-recovery-required&email=test%40gmail.com", [
    "Account recovery required",
    "test@gmail.com",
  ]);
  await expectPostRedirect("/api/auth/login", { email: "", password: "", next: "/" }, "/login", "missing-credentials");
  await expectPage("/signup", ["What brings you to Liber"]);
  await expectPage("/signup/verify?email=test%40gmail.com&next=/buyer/profile", [
    "Confirm your email",
    "test@gmail.com",
    "Gmail",
  ]);
  await expectProtectedRedirect("/buyer/profile");
  await expectProtectedRedirect("/buyer/badges");
  await expectProtectedRedirect("/seller/search");
  await expectProtectedRedirect("/seller/properties");
  await expectProtectedRedirect("/seller/properties/new");
  await expectProtectedRedirect("/admin");
  await expectProtectedRedirect("/admin/reports");
  await expectProtectedRedirect("/admin/users");

  console.log("route smoke passed");
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  stopServer();
}

process.exit(exitCode);
