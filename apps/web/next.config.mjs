import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(workspaceRoot);
const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@liber/db", "@liber/ui", "@liber/validators"],
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "child-src blob:",
          "connect-src 'self' https://*.supabase.co https://*.tiles.mapbox.com https://api.mapbox.com https://events.mapbox.com",
          "font-src 'self' data:",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com",
          "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
          ...(isProduction ? ["upgrade-insecure-requests"] : []),
          "worker-src 'self' blob:",
        ].join("; "),
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
    ];
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
