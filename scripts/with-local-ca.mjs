import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-local-ca.mjs <command> [...args]");
  process.exit(1);
}

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localCaPath = path.join(workspaceRoot, ".certs", "norton-web-mail-shield-root.pem");
const env = { ...process.env };

if (!env.NODE_EXTRA_CA_CERTS && existsSync(localCaPath)) {
  env.NODE_EXTRA_CA_CERTS = localCaPath;
}

const child = spawn(command, args, {
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
