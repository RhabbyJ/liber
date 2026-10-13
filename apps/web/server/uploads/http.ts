import { NextResponse } from "next/server";
import { ZodError } from "zod";
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

export function uploadErrorResponse(error: unknown) {
  if (error instanceof UploadError || error instanceof RequestBodyError) {
    return privateUploadJson(
      { error: error.message },
      error.status,
      error instanceof UploadError ? error.retryAfterSeconds : undefined,
    );
  }
  if (error instanceof ZodError) return privateUploadJson({ error: "Invalid upload request." }, 400);
  // Provider and database errors can include private paths, tokens, or user input.
  console.error("Private file request failed.");
  return privateUploadJson({ error: "Private file service unavailable. Try again later." }, 503);
}
