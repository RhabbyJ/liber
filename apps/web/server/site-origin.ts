export function configuredSiteOrigin() {
  const production = process.env.NODE_ENV === "production";
  const configured = process.env.SITE_URL
    || (production ? undefined : process.env.NEXT_PUBLIC_SITE_URL)
    || (production ? undefined : "http://localhost:3000");
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const localHttp = !production
      && url.protocol === "http:"
      && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp)
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}
