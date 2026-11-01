import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `npm run build` writes a self-contained site to `out/`
  // that any static host (Vercel, Netlify, S3/CloudFront, Nginx, Apache) can serve.
  output: "export",
  // Emit `/about/index.html` instead of `/about.html` so plain static servers
  // resolve clean URLs without rewrite rules.
  trailingSlash: true,
  // The runtime image optimizer is unavailable in a static export; screenshots
  // are pre-sized by `npm run images` instead.
  images: { unoptimized: true },
  // This folder may sit inside another repository; pin the project root so
  // Next.js does not pick up a parent lockfile.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
