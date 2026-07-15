import type { NextRequest } from "next/server";

function requestOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export function requestUrl(request: NextRequest, path: string) {
  return new URL(path, requestOrigin(request));
}

export function isRequestSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) return origin === requestOrigin(request);

  return request.headers.get("sec-fetch-site") === "same-origin";
}
