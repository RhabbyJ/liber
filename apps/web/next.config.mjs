import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(workspaceRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@liber/db", "@liber/ui", "@liber/validators"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
