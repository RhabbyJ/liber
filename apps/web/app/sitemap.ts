import type { MetadataRoute } from "next";
import { configuredSiteOrigin } from "../server/site-origin";

const PUBLIC_PATHS = ["/", "/login", "/signup"];

/** Public pages only; buyer profiles are never crawlable pages (V1 public preview rules). */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = configuredSiteOrigin();
  if (!origin) return [];
  return PUBLIC_PATHS.map((path) => ({ url: new URL(path, origin).toString() }));
}
