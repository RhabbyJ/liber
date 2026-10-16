import type { MetadataRoute } from "next";
import { productionTestingModeEnabled } from "../server/preview-environment";
import { configuredSiteOrigin } from "../server/site-origin";

/**
 * Only the public map and the Auth entry pages are crawlable. Workspaces, profiles,
 * conversations, Auth callbacks, and APIs are private; buyer profiles, messages, and preview
 * tools also send `X-Robots-Tag: noindex`. Built with the server-only `SITE_URL`.
 */
export default function robots(): MetadataRoute.Robots {
  // While the team tests in production, every account becomes an admin: keep crawlers out.
  if (productionTestingModeEnabled()) return { rules: { disallow: "/", userAgent: "*" } };
  const origin = configuredSiteOrigin();
  return {
    rules: {
      allow: ["/", "/login", "/signup"],
      disallow: [
        "/admin",
        "/buyer",
        "/seller",
        "/buyers",
        "/messages",
        "/negotiations",
        "/profile",
        "/notifications",
        "/preview-tools",
        "/api",
        "/auth",
      ],
      userAgent: "*",
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
