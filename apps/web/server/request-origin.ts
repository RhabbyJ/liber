import type { NextRequest } from "next/server";

export function requestOrigin(request: NextRequest) {
  return forwardedOrigin(request) ?? new URL(request.url).origin;
}

function forwardedOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  if (protocol !== "https" && protocol !== "http") return null;
  if (!host) return new URL(request.url).origin;
  if (/[\s,\\/?#@]/.test(host)) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function requestUrl(request: NextRequest, path: string) {
  return new URL(path, requestOrigin(request));
}

export function isRequestSameOrigin(request: NextRequest) {
  const expectedOrigin = forwardedOrigin(request);
  if (!expectedOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;

  return fetchSite === "same-origin";
}
