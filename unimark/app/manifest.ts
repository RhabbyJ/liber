import type { MetadataRoute } from "next";
import { site } from "@/content/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "browser",
    background_color: "#F7F7F7",
    theme_color: "#1B1C28",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    related_applications: [
      { platform: "itunes", url: site.stores.ios.url, id: site.stores.ios.appId },
      { platform: "play", url: site.stores.android.url, id: site.stores.android.appId },
    ],
  };
}
