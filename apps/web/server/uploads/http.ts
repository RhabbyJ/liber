import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { routeLabel, summarizeError } from "../error-summary";
import { RequestBodyError } from "../request-body";
import { UploadError } from "./errors";

export function privateUploadJson(body: unknown, status = 200, retryAfterSeconds?: number) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
      ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
    status,
  });
}

/**
 * Maps a private file route failure to a response. Pass the route template or
 * the incoming Request so logs name the route; identifiers are not logged.
 */
export function uploadErrorResponse(error: unknown, route?: string | Request) {
  if (error instanceof UploadError || error instanceof RequestBodyError) {
    return privateUploadJson(
      { error: error.message },
      error.status,
      error instanceof UploadError ? error.retryAfterSeconds : undefined,
    );
  }
  if (error instanceof ZodError) return privateUploadJson({ error: "Invalid upload request." }, 400);
  // Provider and database errors can include private paths, tokens, or user
  // input; only the class, codes, and a redacted message are logged.
  console.error("Private file request failed.", { route: routeLabel(route), ...summarizeError(error) });
  return privateUploadJson({ error: "Private file service unavailable. Try again later." }, 503);
}
