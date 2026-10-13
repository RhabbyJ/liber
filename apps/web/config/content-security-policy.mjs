import { supabaseOrigins } from "./csp-origins.mjs";

export function contentSecurityPolicy({ nonce, production, supabaseUrl }) {
  const { supabaseHttpOrigin, supabaseRealtimeOrigin } = supabaseOrigins(supabaseUrl);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "child-src blob:",
    ["connect-src 'self'", supabaseHttpOrigin, supabaseRealtimeOrigin,
      "https://*.tiles.mapbox.com https://api.mapbox.com https://events.mapbox.com"].filter(Boolean).join(" "),
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ["img-src 'self' data: blob:", supabaseHttpOrigin, "https://api.mapbox.com"].filter(Boolean).join(" "),
    "object-src 'none'",
    // Nonces authorize framework bootstrap scripts. Untrusted inline scripts stay blocked.
    nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`
      : "script-src 'none'",
    // Mapbox and React use inline style attributes; script execution remains nonce-bound.
    "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
    ...(production ? ["upgrade-insecure-requests"] : []),
    "worker-src 'self' blob:",
  ].join("; ");
}
