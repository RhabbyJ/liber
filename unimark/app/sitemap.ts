import type { MetadataRoute } from "next";
import { site } from "@/content/site";

export const dynamic = "force-static";

const ROUTES = ["/", "/about/", "/partners/", "/contact/"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url ?? "http://localhost:3000";
  return ROUTES.map((route) => ({
    url: `${base}${route}`,
    changeFrequency: "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}
