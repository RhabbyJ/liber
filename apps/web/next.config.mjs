import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { contentSecurityPolicy } from "./config/content-security-policy.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(workspaceRoot);
const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  transpilePackages: ["@liber/db", "@liber/validators"],
  outputFileTracingIncludes: {
    "/api/loi/negotiations/*/pdf": ["./public/fonts/DejaVuSans.ttf"],
  },
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        // Page requests replace this restrictive fallback with a fresh nonce in proxy.ts.
        value: contentSecurityPolicy({ nonce: null, production: isProduction,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }),
      },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/buyers/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
        ],
      },
      {
        source: "/messages/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
        ],
      },
      {
        source: "/preview-tools/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
        ],
      },
    ];
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
